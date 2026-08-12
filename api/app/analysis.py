import asyncio
import json
from collections import Counter
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Self
from uuid import uuid4

from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import gemini, regions, scoring, store
from app.axes import AXIS_NAMES, DISPLAY_AXES, SCORING_AXES
from app.config import get_settings
from app.logging import log_event
from app.prompts import load_report_prompt as load_prompt

AxisName = Literal[*AXIS_NAMES]
PoleName = Literal[*tuple(pole for _axis, poles, _default in SCORING_AXES for pole in poles)]
Sentence = Annotated[str, Field(min_length=1)]
TokenUsage = dict[str, int] | None
CandidateTable = dict[str, dict[str, dict[str, str]]]

AGE_BANDS = (("19~24", 19, 24), ("25~29", 25, 29), ("30~34", 30, 34), ("35~39", 35, 39))
TOPICS = ("일자리", "주거", "교통", "문화", "환경", "돌봄", "안전", "교육", "상권")

# This temporary mapping applies only to the demo's AI-generated resident sample.
GENDERS = {
    "시온": "male",
    "성민": "male",
    "준호": "male",
    "태영": "male",
    "도현": "male",
    "수현": "female",
    "은채": "female",
    "소윤": "female",
    "가영": "female",
    "지우": "female",
    "민서": "female",
    "하은": "female",
}


class NoSubmissionsError(Exception):
    """Signal that an analysis run has no stored input."""


class StrictModel(BaseModel):
    """Reject non-strict values in model-owned analysis output."""

    model_config = ConfigDict(strict=True)


class DeidentifiedDemand(StrictModel):
    """Accept only the text fields returned for one demand."""

    id: Annotated[str, Field(min_length=1)]
    title: Annotated[str, Field(min_length=1)]
    description: Annotated[list[Sentence], Field(min_length=1)]
    quotes: Annotated[list[Sentence], Field(min_length=1)]


class DeidentifiedAxis(StrictModel):
    """Accept one axis of de-identified demand text, including an unevidenced empty one."""

    axis: AxisName
    demands: Annotated[list[DeidentifiedDemand], Field(max_length=2)]


class DeidentifiedResponse(StrictModel):
    """Accept one complete ordered de-identification response."""

    axis_demands: Annotated[
        list[DeidentifiedAxis],
        Field(min_length=len(AXIS_NAMES), max_length=len(AXIS_NAMES)),
    ]

    @model_validator(mode="after")
    def require_axis_order(self) -> Self:
        """Reject missing, duplicate, or reordered de-identification axes."""
        if [item.axis for item in self.axis_demands] != list(AXIS_NAMES):
            raise ValueError("axis_demands must use the contracted axis order")
        return self


class AggregatePole(StrictModel):
    """Accept one pole's bounded qualitative summary."""

    letter: PoleName
    sentences: Annotated[list[Sentence], Field(max_length=3)]


class AggregateAxis(StrictModel):
    """Accept one axis summary and its selected candidate identifiers."""

    axis: AxisName
    poles: Annotated[list[AggregatePole], Field(min_length=2, max_length=2)]
    quote_ids: Annotated[list[Sentence], Field(max_length=4)]


class AggregateResponse(StrictModel):
    """Accept one complete ordered qualitative summary response."""

    axes: Annotated[
        list[AggregateAxis],
        Field(min_length=len(AXIS_NAMES), max_length=len(AXIS_NAMES)),
    ]

    @model_validator(mode="after")
    def require_axis_and_pole_order(self) -> Self:
        """Reject reordered axes or poles before run assembly."""
        expected_axes = [axis for axis, _poles, _default in SCORING_AXES]
        if [item.axis for item in self.axes] != expected_axes:
            raise ValueError("axes must use the contracted axis order")
        expected_poles = {axis: list(poles) for axis, poles, _default in SCORING_AXES}
        for item in self.axes:
            if [pole.letter for pole in item.poles] != expected_poles[item.axis]:
                raise ValueError("poles must use the contracted axis order")
        return self


class InsightResponse(StrictModel):
    """Accept exactly one interpretation string for each dashboard card."""

    # extra="forbid" would emit additionalProperties, which Gemini rejects as a response schema.
    map: Sentence
    topics: Sentence
    axes: Sentence
    cross: Sentence
    types: Sentence


async def deidentify(document: store.Document) -> TokenUsage:
    """Blind one submission's report text and persist its fixed-field copy."""
    usage: TokenUsage = None
    try:
        config = types.GenerateContentConfig(
            system_instruction=load_prompt("deidentify.md"),
            response_mime_type="application/json",
            response_schema=DeidentifiedResponse,
        )
        response = await gemini.get_client().aio.models.generate_content(
            model=get_settings().gemini_model,
            contents=json.dumps(
                _deidentification_input(document),
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            config=config,
        )
        usage = gemini.token_usage(response.usage_metadata)
        deidentified = assemble_deidentified(document, json.loads(response.text))
        saved = {key: value for key, value in document.items() if key != "submission_id"}
        saved["deidentified"] = deidentified
        store.get_store().save(document["submission_id"], saved)
        document["deidentified"] = deidentified
        return usage
    except Exception as error:
        log_event(
            "deidentification_failed",
            session_id=document.get("session_id"),
            token_usage=usage,
            submission_id=document.get("submission_id"),
            reason=type(error).__name__,
        )
        return usage


def assemble_deidentified(
    document: store.Document,
    value: object,
) -> dict[str, list[dict[str, Any]]]:
    """Validate model text and restore every backend-owned demand field."""
    generated = DeidentifiedResponse.model_validate(value)
    original_axes = document["report"]["axis_demands"]
    _validate_deidentified(original_axes, generated.axis_demands)
    quote_number = 0
    assembled_axes = []
    for original_axis, generated_axis in zip(
        original_axes,
        generated.axis_demands,
        strict=True,
    ):
        demands = []
        for original, blinded in zip(
            original_axis["demands"],
            generated_axis.demands,
            strict=True,
        ):
            quotes = []
            for original_quote, blinded_text in zip(
                original["quotes"],
                blinded.quotes,
                strict=True,
            ):
                quote_number += 1
                quotes.append(
                    {
                        "text": blinded_text,
                        "turn": original_quote["turn"],
                        "quote_id": f"{document['submission_id'][:8]}-Q{quote_number}",
                    }
                )
            demands.append(
                {
                    "id": original["id"],
                    "title": blinded.title,
                    "description": list(blinded.description),
                    "topics": list(original["topics"]),
                    "quotes": quotes,
                }
            )
        assembled_axes.append(
            {
                "axis": original_axis["axis"],
                "letter": original_axis["letter"],
                "demands": demands,
            }
        )
    return {"axis_demands": assembled_axes}


def axis_stats(documents: list[store.Document]) -> list[dict[str, object]]:
    """Aggregate evidenced pole counts and stored-strength means by axis."""
    stats = []
    for axis, poles, _default in SCORING_AXES:
        included = []
        for document in documents:
            result = next(item for item in document["type_result"]["axes"] if item["axis"] == axis)
            if _has_axis_evidence(result):
                included.append((document["submission_id"], result))
        pole_stats = []
        for pole in poles:
            strengths = [
                result["strength"]
                for _submission_id, result in included
                if result["letter"] == pole
            ]
            pole_stats.append(
                {
                    "letter": pole,
                    "count": len(strengths),
                    "mean_strength": (
                        scoring.round_half_up(sum(strengths) / len(strengths)) if strengths else 0
                    ),
                }
            )
        stats.append(
            {
                "axis": axis,
                "poles": pole_stats,
                "submission_ids": [submission_id for submission_id, _result in included],
            }
        )
    return stats


def type_distribution(documents: list[store.Document]) -> dict[str, int]:
    """Count every stored submission by its deterministic type code."""
    return dict(Counter(document["type_result"]["code"] for document in documents))


def dashboard_aggregates(
    documents: list[store.Document],
    reference_year: int,
) -> dict[str, object]:
    """Build every code-calculated dashboard field from stored submissions."""
    age_counts = {band: Counter({"male": 0, "female": 0, "unknown": 0}) for band, _, _ in AGE_BANDS}
    region_counts: Counter[str] = Counter()
    topic_demands: Counter[str] = Counter()
    topic_people: Counter[str] = Counter()
    cross_counts = {topic: [0] * len(AGE_BANDS) for topic in TOPICS}
    included_ages = []
    people = []
    demand_count = 0

    for document in documents:
        info = document["self_info"]
        age = _age(info, reference_year)
        band_index = _age_band_index(age)
        gender = GENDERS.get(info["nickname"], "unknown")
        if band_index is not None:
            band = AGE_BANDS[band_index][0]
            age_counts[band][gender] += 1
            included_ages.append(age)

        region = info["normalized_region"]
        if region:
            region_counts[region] += 1

        mentioned_topics = set()
        for axis in document["report"]["axis_demands"]:
            demand_count += len(axis["demands"])
            for demand in axis["demands"]:
                for topic in demand["topics"]:
                    if topic not in TOPICS:
                        continue
                    topic_demands[topic] += 1
                    mentioned_topics.add(topic)
                    if band_index is not None:
                        cross_counts[topic][band_index] += 1
        topic_people.update(mentioned_topics)
        people.append(_person(document, age, gender, region))

    ages = []
    for band, _minimum, _maximum in AGE_BANDS:
        counts = age_counts[band]
        ages.append(
            {
                "band": band,
                "male": counts["male"],
                "female": counts["female"],
                "unknown": counts["unknown"],
                "total": sum(counts.values()),
            }
        )

    topic_order = sorted(
        TOPICS,
        key=lambda topic: (-topic_demands[topic], -topic_people[topic], TOPICS.index(topic)),
    )
    regions_count = {
        region: region_counts[region] for region in regions.DISTRICTS if region_counts[region]
    }
    people.sort(key=lambda item: item["submitted_at"], reverse=True)
    return {
        "kpi": {
            "participants": len(documents),
            "demands": demand_count,
            "regions": len(regions_count),
            "age_min": min(included_ages, default=0),
            "age_max": max(included_ages, default=0),
        },
        "ages": ages,
        "regions_count": regions_count,
        "topics": [
            {
                "topic": topic,
                "demands": topic_demands[topic],
                "people": topic_people[topic],
            }
            for topic in topic_order
        ],
        "cross": {topic: cross_counts[topic] for topic in topic_order},
        "people": people,
    }


def _age(info: dict[str, Any], reference_year: int) -> int:
    """Calculate age the same way sessions derive age_2040, or zero without a birth year."""
    birth_year = info.get("birth_year")
    if birth_year is None:
        return 0
    return reference_year - birth_year


def _age_band_index(age: int) -> int | None:
    """Return the fixed youth age-band position or None when out of range."""
    for index, (_band, minimum, maximum) in enumerate(AGE_BANDS):
        if minimum <= age <= maximum:
            return index
    return None


def _person(
    document: store.Document,
    age: int,
    gender: str,
    region: str,
) -> dict[str, object]:
    """Project one submission into its dashboard participant entry."""
    report = document["report"]
    demands = []
    if document["deidentified"] is not None:
        safe_axes = {axis["axis"]: axis for axis in document["deidentified"]["axis_demands"]}
        for original_axis in report["axis_demands"]:
            safe_axis = safe_axes[original_axis["axis"]]
            demands.extend(
                {
                    "axis": original_axis["axis"],
                    "title": safe["title"],
                    "topics": list(original["topics"]),
                }
                for original, safe in zip(
                    original_axis["demands"],
                    safe_axis["demands"],
                    strict=True,
                )
            )
    return {
        "submission_id": document["submission_id"],
        "nickname": document["self_info"]["nickname"],
        "gender": gender,
        "age": age,
        "region": region,
        "code": document["type_result"]["code"],
        "turns": report["meta"]["turn_count"],
        "submitted_at": document["submitted_at"],
        "summary": " ".join(report["summary"]),
        "demands": demands,
        "reasons": list(report["axis_reasons"]),
    }


def build_summary_input(
    documents: list[store.Document],
) -> tuple[dict[str, object], CandidateTable]:
    """Build qualitative input and an axis-scoped quote lookup from safe copies."""
    axes = []
    candidates: CandidateTable = {axis: {} for axis in AXIS_NAMES}
    displays = dict(DISPLAY_AXES)
    for axis, poles, _default in SCORING_AXES:
        pole_demands = {pole: [] for pole in poles}
        quote_candidates = []
        for document in documents:
            if document["deidentified"] is None:
                continue
            result = next(item for item in document["type_result"]["axes"] if item["axis"] == axis)
            if not _has_axis_evidence(result):
                continue
            axis_copy = next(
                item for item in document["deidentified"]["axis_demands"] if item["axis"] == axis
            )
            for demand in axis_copy["demands"]:
                pole_demands[result["letter"]].append(
                    {
                        "title": demand["title"],
                        "description": list(demand["description"]),
                    }
                )
                for quote in demand["quotes"]:
                    quote_candidates.append(
                        {
                            "quote_id": quote["quote_id"],
                            "letter": result["letter"],
                            "text": quote["text"],
                        }
                    )
                    candidates[axis][quote["quote_id"]] = {
                        "quote_id": quote["quote_id"],
                        "submission_id": document["submission_id"],
                        "text": quote["text"],
                    }
        axes.append(
            {
                "axis": axis,
                "display": displays[axis],
                "poles": [{"letter": pole, "demands": pole_demands[pole]} for pole in poles],
                "quote_candidates": quote_candidates,
            }
        )
    return {"axes": axes}, candidates


def _has_axis_evidence(result: dict[str, Any]) -> bool:
    """Return whether one scored axis contains observed evidence."""
    return bool(result["evidence"])


def assemble_axis_summaries(
    value: object,
    candidates: CandidateTable,
) -> list[dict[str, object]]:
    """Restore selected quote sources while dropping unknown candidate ids."""
    generated = AggregateResponse.model_validate(value)
    summaries = []
    for item in generated.axes:
        axis_candidates = candidates[item.axis]
        summaries.append(
            {
                "axis": item.axis,
                "poles": [
                    {"letter": pole.letter, "sentences": list(pole.sentences)}
                    for pole in item.poles
                ],
                "quotes": [
                    dict(axis_candidates[quote_id])
                    for quote_id in item.quote_ids
                    if quote_id in axis_candidates
                ],
            }
        )
    return summaries


async def execute() -> str:
    """Run de-identification, aggregation, summarization, and persistence once."""
    documents = store.get_store().list()
    if not documents:
        raise NoSubmissionsError

    usages = await asyncio.gather(
        *(deidentify(document) for document in documents if document["deidentified"] is None)
    )
    summaries, summary_usage = await _summarize(documents)
    run_id = str(uuid4())
    executed_at = datetime.now(UTC)
    stats = axis_stats(documents)
    distribution = type_distribution(documents)
    dashboard = dashboard_aggregates(documents, executed_at.year)
    displays = dict(DISPLAY_AXES)
    notes, insight_usage = await _insight(
        {
            "kpi": dashboard["kpi"],
            "ages": dashboard["ages"],
            "regions_count": dashboard["regions_count"],
            "topics": dashboard["topics"],
            "cross": dashboard["cross"],
            # Letters alone are meaningless without demand text, so the axis name rides along.
            "axis_stats": [
                {"axis": stat["axis"], "display": displays[stat["axis"]], "poles": stat["poles"]}
                for stat in stats
            ],
            "type_distribution": distribution,
        }
    )
    run_document = {
        "executed_at": executed_at,
        "input_submission_ids": [document["submission_id"] for document in documents],
        "axis_stats": stats,
        "type_distribution": distribution,
        "axis_summaries": summaries,
        **dashboard,
        "ai_notes": notes,
    }
    store.get_analysis_store().save(run_id, run_document)
    log_event(
        "analysis_run",
        token_usage=_sum_token_usage([*usages, summary_usage, insight_usage]),
        run_id=run_id,
        submission_count=len(documents),
        deidentified_count=sum(document["deidentified"] is not None for document in documents),
    )
    return run_id


def _deidentification_input(document: store.Document) -> dict[str, object]:
    """Remove every backend-owned field from de-identification input."""
    return {
        "axis_demands": [
            {
                "axis": axis["axis"],
                "demands": [
                    {
                        "id": demand["id"],
                        "title": demand["title"],
                        "description": list(demand["description"]),
                        "quotes": [
                            {"text": quote["text"], "turn": quote["turn"]}
                            for quote in demand["quotes"]
                        ],
                    }
                    for demand in axis["demands"]
                ],
            }
            for axis in document["report"]["axis_demands"]
        ]
    }


def _validate_deidentified(
    original_axes: list[dict[str, Any]],
    generated_axes: list[DeidentifiedAxis],
) -> None:
    """Reject any model response that changes positional report structure."""
    if len(original_axes) != len(generated_axes):
        raise ValueError("de-identification axis count changed")
    for original_axis, generated_axis in zip(original_axes, generated_axes, strict=True):
        if original_axis["axis"] != generated_axis.axis:
            raise ValueError("de-identification axis order changed")
        original_demands = original_axis["demands"]
        if [demand["id"] for demand in original_demands] != [
            demand.id for demand in generated_axis.demands
        ]:
            raise ValueError("de-identification demand ids changed")
        for original, generated in zip(
            original_demands,
            generated_axis.demands,
            strict=True,
        ):
            if len(original["description"]) != len(generated.description):
                raise ValueError("de-identification sentence count changed")
            if len(original["quotes"]) != len(generated.quotes):
                raise ValueError("de-identification quote count changed")


async def _summarize(
    documents: list[store.Document],
) -> tuple[list[dict[str, object]], TokenUsage]:
    """Generate all four qualitative axis summaries in one Gemini call."""
    payload, candidates = build_summary_input(documents)
    config = types.GenerateContentConfig(
        system_instruction=load_prompt("aggregate.md"),
        response_mime_type="application/json",
        response_schema=AggregateResponse,
    )
    response = await gemini.get_client().aio.models.generate_content(
        model=get_settings().gemini_model,
        contents=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        config=config,
    )
    return (
        assemble_axis_summaries(json.loads(response.text), candidates),
        gemini.token_usage(response.usage_metadata),
    )


async def _insight(
    payload: dict[str, object],
) -> tuple[dict[str, str], TokenUsage]:
    """Generate all five dashboard interpretations without exposing participant data."""
    usage: TokenUsage = None
    try:
        config = types.GenerateContentConfig(
            system_instruction=load_prompt("insight.md"),
            response_mime_type="application/json",
            response_schema=InsightResponse,
        )
        response = await gemini.get_client().aio.models.generate_content(
            model=get_settings().gemini_model,
            contents=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            config=config,
        )
        usage = gemini.token_usage(response.usage_metadata)
        generated = InsightResponse.model_validate(json.loads(response.text))
        return generated.model_dump(), usage
    except Exception as error:
        log_event(
            "insight_failed",
            token_usage=usage,
            reason=type(error).__name__,
        )
        return {}, usage


def _sum_token_usage(usages: list[TokenUsage]) -> TokenUsage:
    """Sum available token counters across calls in one analysis run."""
    total: Counter[str] = Counter()
    for usage in usages:
        if usage is not None:
            total.update(usage)
    return dict(total) or None
