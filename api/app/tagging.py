import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Annotated, Literal

from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, RootModel

from app import gemini, session
from app.axes import AXIS_NAMES, AXIS_POLES, EVIDENCE_WEIGHTS, SCORING_AXES, Evidence
from app.config import get_settings
from app.prompts import load_scoring_instruction

AxisName = Literal[*AXIS_NAMES]
PoleName = Literal[
    *tuple(pole for _axis, poles, _default in SCORING_AXES for pole in poles)
]
# A Literal would emit an integer enum, which Gemini's Schema type accepts only as strings.
Weight = Annotated[int, Field(ge=min(EVIDENCE_WEIGHTS), le=max(EVIDENCE_WEIGHTS))]
TokenUsage = dict[str, int] | None


class StrictModel(BaseModel):
    """Keep generated evidence fields within the prompt-owned JSON contract."""

    # extra="forbid" would emit additionalProperties, which Gemini's response_schema rejects.
    model_config = ConfigDict(strict=True)


class EvidenceItem(StrictModel):
    """Define one model-generated evidence item without a turn number."""

    axis: AxisName
    pole: PoleName
    weight: Weight
    text: Annotated[str, Field(min_length=1)]


class EvidenceResponse(RootModel[list[EvidenceItem]]):
    """Force the scoring response to be one bare evidence array."""

    model_config = ConfigDict(strict=True)


@dataclass(frozen=True)
class TagResult:
    """Keep validated evidence, validation issues, and usage together."""

    evidence: list[Evidence]
    issues: list[str]
    token_usage: TokenUsage


async def tag(
    messages: Sequence[session.Message],
    evidence_log: Sequence[Mapping[str, object]],
    participant_utterance: str,
    turn: int,
) -> TagResult:
    """Tag one participant utterance through an independent Gemini call."""
    contents = json.dumps(
        {
            "transcript": session.serialize_transcript(messages),
            "evidence_log": list(evidence_log),
            "participant_utterance": participant_utterance,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    config = types.GenerateContentConfig(
        system_instruction=load_scoring_instruction(),
        response_mime_type="application/json",
        response_schema=EvidenceResponse,
    )
    response = await gemini.get_client().aio.models.generate_content(
        model=get_settings().gemini_model,
        contents=contents,
        config=config,
    )
    evidence, issues = _parse(response.text, turn)
    return TagResult(
        evidence=evidence,
        issues=issues,
        token_usage=gemini.token_usage(response.usage_metadata),
    )


def _parse(payload: str, turn: int) -> tuple[list[Evidence], list[str]]:
    """Parse a scoring response and retain every independently valid item."""
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError:
        return [], ["evidence_json_invalid"]
    if not isinstance(decoded, list):
        return [], ["evidence_array_required"]

    evidence: list[Evidence] = []
    issues: list[str] = []
    for index, item in enumerate(decoded):
        validated = _validate_item(item, turn)
        if validated is None:
            issues.append(f"evidence_item_invalid:{index}")
        else:
            evidence.append(validated)
    return evidence, issues


def _validate_item(item: object, turn: int) -> Evidence | None:
    """Validate and stamp one evidence item against the scoring contract."""
    if not isinstance(item, dict):
        return None
    axis = item.get("axis")
    pole = item.get("pole")
    weight = item.get("weight")
    text = item.get("text")
    if not isinstance(axis, str) or not isinstance(pole, str):
        return None
    if axis not in AXIS_POLES or pole not in AXIS_POLES[axis]:
        return None
    if type(weight) is not int or weight not in EVIDENCE_WEIGHTS:
        return None
    if not isinstance(text, str) or not text.strip():
        return None
    # The backend owns turn numbering, so the model is never asked to count turns.
    return {"axis": axis, "pole": pole, "weight": weight, "text": text, "turn": turn}
