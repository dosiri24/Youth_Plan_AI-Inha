import copy
import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal, Self, TypedDict, TypeVar
from unicodedata import normalize

from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import axes, gemini, regions, session
from app.axes import AXIS_NAMES
from app.config import get_settings
from app.logging import log_event
from app.prompts import load_report_prompt as load_prompt
from app.scoring import TypeResult

AxisName = Literal[*AXIS_NAMES]
# Gemini rejects an empty string inside a response-schema enum, so absence arrives as a word.
SETTLEMENT_ABSENT = "없음"
SettlementValue = Literal["인천", "타지", SETTLEMENT_ABSENT]
# Gemini caps total response-schema enums, so this stays text to leave room for other fields.
PLACE_KINDS = ("거주지", "활동 장소", "문제 장소")
PlaceKind = Literal[*PLACE_KINDS]
Sentence = Annotated[str, Field(min_length=1)]
TokenUsage = dict[str, int] | None
# An axis with no evidence has no explanation, so the code states that instead of the model.
EMPTY_AXIS_REASON = "이 대화에서는 이 부분을 판단할 이야기가 나오지 않았습니다."


class StrictModel(BaseModel):
    """Reject model output outside the prompt-owned JSON contract."""

    # extra="forbid" would emit additionalProperties, which Gemini's response_schema rejects.
    model_config = ConfigDict(strict=True)


class StructuredSelfInfo(StrictModel):
    """Keep model-extracted participant identity fields as strings."""

    nickname: str
    raw_region: str
    normalized_region: str
    dong: str
    dream_or_job: str


class StructuredQuote(StrictModel):
    """Keep evidence references anchored to a concrete participant turn."""

    text: Annotated[str, Field(min_length=1)]
    turn: Annotated[int, Field(ge=1)]


class StructuredSettlement(StrictModel):
    """Keep each settlement intention inside the fixed location vocabulary."""

    residence: SettlementValue
    work: SettlementValue
    leisure: SettlementValue


class StructuredTopDemand(StrictModel):
    """Keep the participant's single closing choice and its evidence."""

    title: str
    reason: list[Sentence]
    quotes: Annotated[list[StructuredQuote], Field(max_length=2)]
    demand_id: str


class StructuredPlace(StrictModel):
    """Keep one participant-spoken place anchored to its source turn."""

    text: Annotated[str, Field(min_length=1)]
    turn: Annotated[int, Field(ge=1)]
    kind: str
    district: str


class StructuredDemand(StrictModel):
    """Keep generated demands selectable and evidence-backed."""

    id: Annotated[str, Field(min_length=1)]
    title: Annotated[str, Field(min_length=1)]
    description: Annotated[list[Sentence], Field(min_length=1)]
    quotes: Annotated[list[StructuredQuote], Field(min_length=1, max_length=2)]
    places: Annotated[list[StructuredPlace], Field(max_length=3)]


class StructuredAxisReason(StrictModel):
    """Keep each generated explanation tied to one ordered scoring axis."""

    axis: AxisName
    # An axis without evidence has no reason to state, so the model returns an empty string.
    reason: str


class StructuredAxis(StrictModel):
    """Prevent a generated axis from over-expanding while allowing an unevidenced one."""

    axis: AxisName
    demands: Annotated[list[StructuredDemand], Field(max_length=3)]

    @model_validator(mode="after")
    def require_sequential_ids(self) -> Self:
        """Reject IDs that cannot map predictably back to their owning axis."""
        expected = [f"{self.axis}-D{index}" for index in range(1, len(self.demands) + 1)]
        if [demand.id for demand in self.demands] != expected:
            raise ValueError("demand IDs must be sequential within their axis")
        return self


class StructuredReport(StrictModel):
    """Prevent malformed model output from entering participant state."""

    self_info: StructuredSelfInfo
    settlement: StructuredSettlement
    summary: Annotated[list[Sentence], Field(min_length=1)]
    axis_reasons: Annotated[list[StructuredAxisReason], Field(min_length=4, max_length=4)]
    axis_demands: Annotated[list[StructuredAxis], Field(min_length=4, max_length=4)]
    # Declared after axis_demands so the model has already emitted the ids demand_id refers to.
    top_demand: StructuredTopDemand
    participation_notes: list[StructuredQuote]

    @model_validator(mode="after")
    def require_axis_order(self) -> Self:
        """Reject missing, duplicate, or reordered axes before assembly."""
        if [item.axis for item in self.axis_reasons] != list(AXIS_NAMES):
            raise ValueError("axis_reasons must use the contracted axis order")
        if [item.axis for item in self.axis_demands] != list(AXIS_NAMES):
            raise ValueError("axis_demands must use the contracted axis order")
        return self


class RevisedDemands(StrictModel):
    """Accept one regenerated summary and complete ordered demand replacement."""

    summary: Annotated[list[Sentence], Field(min_length=1)]
    axis_demands: Annotated[list[StructuredAxis], Field(min_length=4, max_length=4)]

    @model_validator(mode="after")
    def require_axis_order(self) -> Self:
        """Reject missing, duplicate, or reordered axes before replacement."""
        if [item.axis for item in self.axis_demands] != list(AXIS_NAMES):
            raise ValueError("axis_demands must use the contracted axis order")
        return self


StructuredOutput = TypeVar("StructuredOutput", StructuredReport, RevisedDemands)


class SelfInfo(TypedDict):
    """Keep backend-owned age fields beside validated model-extracted identity."""

    nickname: str
    birth_year: int
    age_2040: int
    gender: str
    raw_region: str
    normalized_region: str
    region_table_version: str
    dong: str
    dream_or_job: str


class Quote(TypedDict):
    """Keep each report claim traceable to participant speech."""

    text: str
    turn: int


class Settlement(TypedDict):
    """Keep residence, work, and leisure settlement intentions together."""

    residence: str
    work: str
    leisure: str


class TopDemand(TypedDict):
    """Keep the participant's single chosen demand and supporting speech."""

    title: str
    reason: list[str]
    quotes: list[Quote]
    demand_id: str


class Place(TypedDict):
    """Keep one mentioned place and its validated district classification."""

    text: str
    turn: int
    kind: PlaceKind
    district: str


class Demand(TypedDict):
    """Keep descriptions addressable at sentence granularity."""

    id: str
    title: str
    description: list[str]
    quotes: list[Quote]
    places: list[Place]


class AxisDemand(TypedDict):
    """Keep deterministic letters separate from generated demand text."""

    axis: AxisName
    letter: str
    demands: list[Demand]


class AxisReason(TypedDict):
    """Keep deterministic letters beside generated judgement explanations."""

    axis: AxisName
    letter: str
    reason: str


class ReportMeta(TypedDict):
    """Keep lifecycle counters under backend ownership."""

    turn_count: int
    revision_count: int
    created_at: datetime


class PersonalReport(TypedDict):
    """Keep the participant report aligned with the persistence contract."""

    session_id: str
    self_info: SelfInfo
    settlement: Settlement
    top_demand: TopDemand
    summary: list[str]
    axis_reasons: list[AxisReason]
    axis_demands: list[AxisDemand]
    participation_notes: list[Quote]
    meta: ReportMeta


class SelectedSentence(TypedDict):
    """Keep participant feedback tied to one current sentence position."""

    axis: AxisName
    demand_id: str
    sentence_index: int


class ResolvedSentence(SelectedSentence):
    """Give Gemini the concrete text behind a selected position."""

    text: str


@dataclass(frozen=True)
class Draft:
    """Keep structured model output and usage together for assembly."""

    structured: StructuredReport
    token_usage: TokenUsage


async def generate_draft(current: session.Session, type_result: TypeResult) -> Draft:
    """Give structuring the slim transcript, fixed judgement, and the axis contract."""
    structured_text, usage = await _generate(
        "structuring.md",
        json.dumps(
            {
                "transcript": session.serialize_transcript(current["messages"]),
                "type_result": type_result,
                # Without the definitions the report has to guess what each letter means.
                "axis_definitions": axes.load_definitions(),
                "districts": regions.load_district_table(),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        response_schema=StructuredReport,
    )
    structured = _check_quotes(
        validate_structure(json.loads(structured_text)),
        current,
    )
    return Draft(
        structured=structured,
        token_usage=usage,
    )


def validate_structure(value: object) -> StructuredReport:
    """Fail immediately instead of repairing an off-contract model response."""
    return StructuredReport.model_validate(value)


def assemble(
    current: session.Session,
    type_result: TypeResult,
    draft: Draft,
) -> PersonalReport:
    """Keep age, district, display letters, and lifecycle metadata backend-owned."""
    extracted = draft.structured.self_info
    dong = extracted.dong
    normalized_region = regions.validate(extracted.normalized_region)
    dong_district = regions.district_for_dong(dong) if dong else ""
    cleared_dong_count = int(bool(dong) and not dong_district)
    overridden_region_count = int(bool(dong_district) and dong_district != normalized_region)
    if cleared_dong_count:
        dong = ""
    if dong_district:
        normalized_region = dong_district

    axis_demands = _axis_demands(draft.structured, type_result)
    overridden_place_count = sum(
        bool(table_district) and table_district != regions.validate(place.district)
        for axis in draft.structured.axis_demands
        for demand in axis.demands
        for place in demand.places
        if (table_district := regions.district_for_dong(place.text))
    )
    if cleared_dong_count or overridden_region_count or overridden_place_count:
        log_event(
            "district_table_corrected",
            session_id=current["session_id"],
            cleared_dong_count=cleared_dong_count,
            overridden_region_count=overridden_region_count,
            overridden_place_count=overridden_place_count,
        )

    return {
        "session_id": current["session_id"],
        "self_info": {
            "nickname": extracted.nickname,
            "birth_year": current["birth_year"],
            "age_2040": current["age_2040"],
            "gender": current["gender"],
            "raw_region": extracted.raw_region,
            "normalized_region": normalized_region,
            "region_table_version": regions.DISTRICT_TABLE_VERSION,
            "dong": dong,
            "dream_or_job": extracted.dream_or_job,
        },
        "settlement": _settlement(draft.structured.settlement),
        "top_demand": draft.structured.top_demand.model_dump(),
        "summary": list(draft.structured.summary),
        "axis_reasons": _axis_reasons(draft.structured, type_result),
        "axis_demands": axis_demands,
        "participation_notes": [note.model_dump() for note in draft.structured.participation_notes],
        "meta": {
            "turn_count": max(
                (message["turn"] for message in current["messages"]),
                default=0,
            ),
            "revision_count": 0,
            "created_at": datetime.now(UTC),
        },
    }


async def revise(
    current: session.Session,
    selections: list[SelectedSentence],
    comment: str,
) -> tuple[PersonalReport, TokenUsage]:
    """Replace the summary and selected-axis demands while preserving other fields."""
    current_report = current["report"]
    type_result = current["type_result"]
    if current_report is None or type_result is None:
        raise ValueError("result is required before revision")

    payload = {
        "transcript": session.serialize_transcript(current["messages"]),
        "type_result": {
            "axes": [
                {"axis": axis["axis"], "letter": axis["letter"]} for axis in type_result["axes"]
            ]
        },
        "axis_demands": current_report["axis_demands"],
        "selected_sentences": _resolve(current_report, selections),
        "comment": comment,
    }
    structured_text, usage = await _generate(
        "structuring.md",
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        response_schema=RevisedDemands,
    )
    selected_axes = {selection["axis"] for selection in selections}
    structured = _check_quotes(
        RevisedDemands.model_validate(json.loads(structured_text)),
        current,
        selected_axes,
    )
    regenerated_axes = {item["axis"]: item for item in _axis_demands(structured, type_result)}
    axis_demands = [
        regenerated_axes[item["axis"]] if item["axis"] in selected_axes else copy.deepcopy(item)
        for item in current_report["axis_demands"]
    ]
    top_demand = copy.deepcopy(current_report["top_demand"])
    top_demand["demand_id"] = ""
    revised: PersonalReport = {
        "session_id": current_report["session_id"],
        "self_info": copy.deepcopy(current_report["self_info"]),
        "settlement": copy.deepcopy(current_report["settlement"]),
        "top_demand": top_demand,
        "summary": list(structured.summary),
        "axis_reasons": copy.deepcopy(current_report["axis_reasons"]),
        "axis_demands": axis_demands,
        "participation_notes": copy.deepcopy(current_report["participation_notes"]),
        "meta": {
            **current_report["meta"],
            "revision_count": current["revision_count"] + 1,
        },
    }
    return revised, usage


def _check_quotes(
    structured: StructuredOutput,
    current: session.Session,
    checked_axes: set[AxisName] | None = None,
) -> StructuredOutput:
    """Drop generated quotes and places absent from their participant turn."""
    user_messages = participant_utterances(current["messages"])
    value = structured.model_dump()
    dropped_quote_count = 0
    dropped_demand_count = 0
    dropped_place_count = 0
    demand_id_map: dict[str, str] = {}

    for axis in value["axis_demands"]:
        if checked_axes is not None and axis["axis"] not in checked_axes:
            continue
        demands = []
        for demand in axis["demands"]:
            old_id = demand["id"]
            quotes = [quote for quote in demand["quotes"] if quote_matches(quote, user_messages)]
            places = [
                place
                for place in demand["places"]
                if place["kind"] in PLACE_KINDS and quote_matches(place, user_messages)
            ]
            dropped_quote_count += len(demand["quotes"]) - len(quotes)
            dropped_place_count += len(demand["places"]) - len(places)
            if not quotes:
                dropped_demand_count += 1
                continue
            demand["quotes"] = quotes
            demand["places"] = places
            new_id = f"{axis['axis']}-D{len(demands) + 1}"
            demand["id"] = new_id
            demand_id_map[old_id] = new_id
            demands.append(demand)
        axis["demands"] = demands

    if isinstance(structured, StructuredReport):
        top_demand = value["top_demand"]
        top_quotes = [
            quote for quote in top_demand["quotes"] if quote_matches(quote, user_messages)
        ]
        dropped_quote_count += len(top_demand["quotes"]) - len(top_quotes)
        top_demand["quotes"] = top_quotes
        top_demand["demand_id"] = demand_id_map.get(top_demand["demand_id"], "")
        if top_demand["title"] and not top_quotes:
            value["top_demand"] = {
                "title": "",
                "reason": [],
                "quotes": [],
                "demand_id": "",
            }
        notes = [
            note for note in value["participation_notes"] if quote_matches(note, user_messages)
        ]
        dropped_quote_count += len(value["participation_notes"]) - len(notes)
        value["participation_notes"] = notes

    if dropped_quote_count or dropped_place_count:
        log_event(
            "quote_check_dropped",
            session_id=current["session_id"],
            dropped_quote_count=dropped_quote_count,
            dropped_demand_count=dropped_demand_count,
            dropped_place_count=dropped_place_count,
        )
    return type(structured).model_validate(value)


def participant_utterances(messages: Sequence[session.Message]) -> dict[int, str]:
    """Index normalized participant speech by its referenced turn."""
    return {
        message["turn"]: _normalize_quote(message["text"])
        for message in messages
        if message["role"] == "user"
    }


def quote_matches(quote: dict[str, object], user_messages: dict[int, str]) -> bool:
    """Match one normalized non-empty quote against its referenced user turn."""
    normalized_quote = _normalize_quote(str(quote["text"]))
    return bool(normalized_quote) and normalized_quote in user_messages.get(int(quote["turn"]), "")


def _normalize_quote(text: str) -> str:
    """Normalize Unicode and remove every whitespace character for comparison."""
    return "".join(character for character in normalize("NFC", text) if not character.isspace())


async def _generate(
    prompt_name: Literal["structuring.md"],
    contents: str,
    *,
    response_schema: type[BaseModel],
) -> tuple[str, TokenUsage]:
    """Keep every report instruction in its mandated external asset."""
    config = types.GenerateContentConfig(
        system_instruction=load_prompt(prompt_name),
        response_mime_type="application/json",
        response_schema=response_schema,
    )
    response = await gemini.get_client().aio.models.generate_content(
        model=get_settings().gemini_model,
        contents=contents,
        config=config,
    )
    return response.text, gemini.token_usage(response.usage_metadata)


def _settlement(structured: StructuredSettlement) -> Settlement:
    """Store an unspoken intention as the empty string every other absent field uses."""
    return {
        key: ("" if value == SETTLEMENT_ABSENT else value)
        for key, value in structured.model_dump().items()
    }


def _axis_demands(
    structured: StructuredReport | RevisedDemands,
    type_result: TypeResult,
) -> list[AxisDemand]:
    """Prevent Gemini from choosing participant-facing type letters."""
    letters = {axis["axis"]: axis["letter"] for axis in type_result["axes"]}
    axis_demands = []
    for item in structured.axis_demands:
        demands = item.model_dump()["demands"]
        for demand in demands:
            for place in demand["places"]:
                place["district"] = regions.district_for_dong(place["text"]) or regions.validate(
                    place["district"]
                )
        axis_demands.append(
            {
                "axis": item.axis,
                "letter": letters[item.axis],
                "demands": demands,
            }
        )
    return axis_demands


def _axis_reasons(
    structured: StructuredReport,
    type_result: TypeResult,
) -> list[AxisReason]:
    """Prevent Gemini from choosing letters or inventing a reason it has no evidence for."""
    scored = {axis["axis"]: axis for axis in type_result["axes"]}
    return [
        {
            "axis": item.axis,
            "letter": scored[item.axis]["letter"],
            "reason": (EMPTY_AXIS_REASON if scored[item.axis]["empty_axis"] else item.reason),
        }
        for item in structured.axis_reasons
    ]


def _resolve(
    current_report: PersonalReport,
    selections: list[SelectedSentence],
) -> list[ResolvedSentence]:
    """Prevent stale positions from hiding the text a participant rejected."""
    resolved = []
    for selection in selections:
        axis = next(
            item for item in current_report["axis_demands"] if item["axis"] == selection["axis"]
        )
        demand = next(item for item in axis["demands"] if item["id"] == selection["demand_id"])
        resolved.append(
            {
                **selection,
                "text": demand["description"][selection["sentence_index"]],
            }
        )
    return resolved


def slim_type_result(type_result: TypeResult) -> dict[str, object]:
    """Remove server-only evidence and scores from a participant response."""
    return {
        "code": type_result["code"],
        "axes": [
            {
                "axis": axis["axis"],
                "letter": axis["letter"],
                "strength": axis["strength"],
                "empty_axis": axis["empty_axis"],
            }
            for axis in type_result["axes"]
        ],
    }


def slim_report(personal_report: PersonalReport) -> dict[str, object]:
    """Remove staff-only report fields from the participant copy."""
    slimmed = copy.deepcopy(personal_report)
    slimmed.pop("participation_notes")
    slimmed.pop("settlement")
    slimmed.pop("top_demand")
    for axis in slimmed["axis_demands"]:
        for demand in axis["demands"]:
            demand.pop("places")
    return slimmed
