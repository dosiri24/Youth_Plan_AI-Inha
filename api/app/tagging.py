import asyncio
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal

from google.genai import errors, types
from pydantic import BaseModel, ConfigDict, Field, RootModel

from app import gemini, report, session
from app.axes import AXIS_NAMES, AXIS_POLES, EVIDENCE_WEIGHTS, SCORING_AXES, Evidence
from app.config import get_settings
from app.logging import log_event
from app.prompts import load_nearest_instruction, load_scoring_instruction
from app.scoring import Nearest

AxisName = Literal[*AXIS_NAMES]
PoleName = Literal[*tuple(pole for _axis, poles, _default in SCORING_AXES for pole in poles)]
# A Literal would emit an integer enum, which Gemini's Schema type accepts only as strings.
Weight = Annotated[int, Field(ge=min(EVIDENCE_WEIGHTS), le=max(EVIDENCE_WEIGHTS))]
TokenUsage = dict[str, int] | None
SCORING_CACHE_TTL = "3600s"

_scoring_cache: types.CachedContent | None = None
_scoring_cache_lock = asyncio.Lock()


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


class NearestItem(StrictModel):
    """Define one model-generated nearest judgement."""

    pole: PoleName
    text: Annotated[str, Field(min_length=1)]


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
    response = await _generate(contents)
    evidence, issues = _parse(response.text, turn)
    return TagResult(
        evidence=evidence,
        issues=issues,
        token_usage=gemini.token_usage(response.usage_metadata),
    )


async def nearest(
    messages: Sequence[session.Message],
    axis: AxisName,
    session_id: str,
) -> Nearest | None:
    """Judge the nearest participant quote and pole for one empty axis."""
    contents = json.dumps(
        {
            "transcript": session.serialize_transcript(messages),
            "axis": axis,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    try:
        response = await gemini.get_client().aio.models.generate_content(
            model=get_settings().gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=load_nearest_instruction(),
                response_mime_type="application/json",
                response_schema=NearestItem,
            ),
        )
        item = NearestItem.model_validate_json(response.text)
    except Exception as exc:
        log_event(
            "nearest_failed",
            session_id=session_id,
            axis=axis,
            reason=type(exc).__name__,
        )
        return None

    if item.pole not in AXIS_POLES[axis]:
        log_event(
            "nearest_failed",
            session_id=session_id,
            axis=axis,
            reason="wrong_axis_pole",
        )
        return None

    user_messages = report.participant_utterances(messages)
    if not any(
        report.quote_matches({"text": item.text, "turn": turn}, user_messages)
        for turn in user_messages
    ):
        log_event(
            "nearest_failed",
            session_id=session_id,
            axis=axis,
            reason="quote_not_found",
        )
        return None

    log_event(
        "nearest_judged",
        session_id=session_id,
        axis=axis,
        pole=item.pole,
        token_usage=gemini.token_usage(response.usage_metadata),
    )
    return {"pole": item.pole, "text": item.text}


async def _generate(contents: str) -> types.GenerateContentResponse:
    """Generate one scoring response with the shared explicit cache when available."""
    cache_name = await _get_scoring_cache()
    try:
        return await _generate_with_cache(contents, cache_name)
    except errors.ClientError as exc:
        if cache_name is None or exc.code != 404:
            raise
    cache_name = await _get_scoring_cache(invalid_name=cache_name)
    return await _generate_with_cache(contents, cache_name)


async def _generate_with_cache(
    contents: str,
    cache_name: str | None,
) -> types.GenerateContentResponse:
    """Preserve the scoring response contract with or without a cache reference."""
    config = types.GenerateContentConfig(
        system_instruction=None if cache_name else load_scoring_instruction(),
        cached_content=cache_name,
        response_mime_type="application/json",
        response_schema=EvidenceResponse,
    )
    return await gemini.get_client().aio.models.generate_content(
        model=get_settings().gemini_model,
        contents=contents,
        config=config,
    )


async def _get_scoring_cache(invalid_name: str | None = None) -> str | None:
    """Return the live process-global scoring cache or create it lazily."""
    global _scoring_cache
    if invalid_name is None and _cache_is_live(_scoring_cache):
        return _scoring_cache.name

    async with _scoring_cache_lock:
        if invalid_name is None and _cache_is_live(_scoring_cache):
            return _scoring_cache.name
        if (
            invalid_name is not None
            and _cache_is_live(_scoring_cache)
            and _scoring_cache.name != invalid_name
        ):
            return _scoring_cache.name

        reason = "invalid_reference" if invalid_name else "expired" if _scoring_cache else None
        try:
            cache = await gemini.get_client().aio.caches.create(
                model=get_settings().gemini_model,
                config=types.CreateCachedContentConfig(
                    display_name="interview scoring axes",
                    system_instruction=load_scoring_instruction(),
                    ttl=SCORING_CACHE_TTL,
                ),
            )
            if cache.name is None:
                raise ValueError("Gemini cache response has no resource name")
        except Exception as exc:
            _scoring_cache = None
            log_event(
                "scoring_cache_failed",
                model=get_settings().gemini_model,
                reason=reason or "initial",
                error_type=type(exc).__name__,
            )
            return None

        _scoring_cache = cache
        event = "scoring_cache_recreated" if reason else "scoring_cache_created"
        log_event(
            event,
            token_usage=gemini.token_usage(cache.usage_metadata),
            model=get_settings().gemini_model,
            **({"reason": reason} if reason else {}),
        )
        return cache.name


def _cache_is_live(cache: types.CachedContent | None) -> bool:
    """Return whether a cache has a usable name and future expiry."""
    return bool(
        cache is not None
        and cache.name
        and cache.expire_time
        and cache.expire_time > datetime.now(UTC)
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
