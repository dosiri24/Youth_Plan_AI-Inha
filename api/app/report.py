import copy
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal, Self, TypedDict

from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import gemini, session
from app.config import get_settings
from app.prompts import load_report_prompt as load_prompt
from app.scoring import TypeResult

AxisName = Literal["EI", "SN", "TF", "JP"]
Sentence = Annotated[str, Field(min_length=1)]
TokenUsage = dict[str, int] | None


class StrictModel(BaseModel):
    """Reject model output outside the prompt-owned JSON contract."""

    # extra="forbid" would emit additionalProperties, which Gemini's response_schema rejects.
    model_config = ConfigDict(strict=True)


class StructuredSelfInfo(StrictModel):
    """Keep inferred identity fields within the three allowed strings."""

    nickname: str
    region: str
    dream_or_job: str


class StructuredQuote(StrictModel):
    """Keep evidence references anchored to a concrete participant turn."""

    text: Annotated[str, Field(min_length=1)]
    turn: Annotated[int, Field(ge=1)]


class StructuredDemand(StrictModel):
    """Keep generated demands selectable and evidence-backed."""

    id: Annotated[str, Field(min_length=1)]
    title: Annotated[str, Field(min_length=1)]
    description: Annotated[list[Sentence], Field(min_length=1)]
    quotes: Annotated[list[StructuredQuote], Field(min_length=1, max_length=2)]


class StructuredAxisReason(StrictModel):
    """Keep each generated explanation tied to one ordered scoring axis."""

    axis: AxisName
    reason: Annotated[str, Field(min_length=1, pattern=r"\S")]


class StructuredAxis(StrictModel):
    """Prevent a generated axis from arriving empty or over-expanded."""

    axis: AxisName
    demands: Annotated[list[StructuredDemand], Field(min_length=1, max_length=2)]

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
    summary: Annotated[list[Sentence], Field(min_length=1)]
    axis_reasons: Annotated[list[StructuredAxisReason], Field(min_length=4, max_length=4)]
    axis_demands: Annotated[list[StructuredAxis], Field(min_length=4, max_length=4)]

    @model_validator(mode="after")
    def require_axis_order(self) -> Self:
        """Reject missing, duplicate, or reordered axes before assembly."""
        if [item.axis for item in self.axis_reasons] != ["EI", "SN", "TF", "JP"]:
            raise ValueError("axis_reasons must use EI, SN, TF, JP order")
        if [item.axis for item in self.axis_demands] != ["EI", "SN", "TF", "JP"]:
            raise ValueError("axis_demands must use EI, SN, TF, JP order")
        return self


class RevisedDemands(StrictModel):
    """Accept only one complete ordered replacement of all axis demands."""

    axis_demands: Annotated[list[StructuredAxis], Field(min_length=4, max_length=4)]

    @model_validator(mode="after")
    def require_axis_order(self) -> Self:
        """Reject missing, duplicate, or reordered axes before replacement."""
        if [item.axis for item in self.axis_demands] != ["EI", "SN", "TF", "JP"]:
            raise ValueError("axis_demands must use EI, SN, TF, JP order")
        return self


class SelfInfo(TypedDict):
    """Keep backend-owned age fields beside model-extracted identity."""

    nickname: str
    birth_year: int
    age_2040: int
    region: str
    dream_or_job: str


class Quote(TypedDict):
    """Keep each report claim traceable to participant speech."""

    text: str
    turn: int


class Demand(TypedDict):
    """Keep descriptions addressable at sentence granularity."""

    id: str
    title: str
    description: list[str]
    quotes: list[Quote]


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
    summary: list[str]
    axis_reasons: list[AxisReason]
    axis_demands: list[AxisDemand]
    meta: ReportMeta


class SelectedSentence(TypedDict):
    """Keep participant feedback tied to one current sentence position."""

    axis: AxisName
    demand_id: str
    sentence_index: int


class ResolvedSentence(SelectedSentence):
    """Give Gemini the concrete text behind a selected position."""

    text: str


class TranscriptMessage(TypedDict):
    """Keep only model-relevant transcript fields in report calls."""

    turn: int
    role: Literal["user", "assistant"]
    text: str


@dataclass(frozen=True)
class Draft:
    """Keep structured model output and usage together for assembly."""

    structured: StructuredReport
    token_usage: TokenUsage


async def generate_draft(current: session.Session, type_result: TypeResult) -> Draft:
    """Give structuring the slim transcript and fixed judgement context."""
    structured_text, usage = await _generate(
        "structuring.md",
        json.dumps(
            {
                "transcript": _serialize_transcript(current["messages"]),
                "type_result": type_result,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        response_schema=StructuredReport,
    )
    structured = validate_structure(json.loads(structured_text))
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
    """Keep age, display letters, and lifecycle metadata backend-owned."""
    extracted = draft.structured.self_info
    return {
        "session_id": current["session_id"],
        "self_info": {
            "nickname": extracted.nickname,
            "birth_year": current["birth_year"],
            "age_2040": current["age_2040"],
            "region": extracted.region,
            "dream_or_job": extracted.dream_or_job,
        },
        "summary": list(draft.structured.summary),
        "axis_reasons": _axis_reasons(draft.structured, type_result),
        "axis_demands": _axis_demands(draft.structured, type_result),
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
    """Limit revision effects to one complete replacement of all demands."""
    current_report = current["report"]
    type_result = current["type_result"]
    if current_report is None or type_result is None:
        raise ValueError("result is required before revision")

    payload = {
        "transcript": _serialize_transcript(current["messages"]),
        "type_result": {
            "axes": [
                {"axis": axis["axis"], "letter": axis["letter"]}
                for axis in type_result["axes"]
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
    structured = RevisedDemands.model_validate(json.loads(structured_text))
    revised: PersonalReport = {
        "session_id": current_report["session_id"],
        "self_info": copy.deepcopy(current_report["self_info"]),
        "summary": list(current_report["summary"]),
        "axis_reasons": copy.deepcopy(current_report["axis_reasons"]),
        "axis_demands": _axis_demands(structured, type_result),
        "meta": {
            **current_report["meta"],
            "revision_count": current["revision_count"] + 1,
        },
    }
    return revised, usage


async def _generate(
    prompt_name: Literal["structuring.md"],
    contents: str,
    *,
    response_schema: type[BaseModel] | None,
) -> tuple[str, TokenUsage]:
    """Keep every report instruction in its mandated external asset."""
    config = types.GenerateContentConfig(
        system_instruction=load_prompt(prompt_name),
        response_mime_type="application/json" if response_schema is not None else None,
        response_schema=response_schema,
    )
    response = await gemini.get_client().aio.models.generate_content(
        model=get_settings().gemini_model,
        contents=contents,
        config=config,
    )
    return response.text, gemini.token_usage(response.usage_metadata)


def _serialize_transcript(messages: list[session.Message]) -> list[TranscriptMessage]:
    """Remove storage-only timestamps from report model input."""
    return [
        {"turn": message["turn"], "role": message["role"], "text": message["text"]}
        for message in messages
    ]


def _axis_demands(
    structured: StructuredReport | RevisedDemands,
    type_result: TypeResult,
) -> list[AxisDemand]:
    """Prevent Gemini from choosing participant-facing type letters."""
    letters = {axis["axis"]: axis["letter"] for axis in type_result["axes"]}
    return [
        {
            "axis": item.axis,
            "letter": letters[item.axis],
            "demands": item.model_dump()["demands"],
        }
        for item in structured.axis_demands
    ]


def _axis_reasons(
    structured: StructuredReport,
    type_result: TypeResult,
) -> list[AxisReason]:
    """Prevent Gemini from choosing letters for judgement explanations."""
    letters = {axis["axis"]: axis["letter"] for axis in type_result["axes"]}
    return [
        {
            "axis": item.axis,
            "letter": letters[item.axis],
            "reason": item.reason,
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
            }
            for axis in type_result["axes"]
        ],
    }


def slim_report(personal_report: PersonalReport) -> dict[str, object]:
    """Remove server-only quotes from a participant response copy."""
    slimmed = copy.deepcopy(personal_report)
    for axis in slimmed["axis_demands"]:
        for demand in axis["demands"]:
            demand.pop("quotes")
    return slimmed
