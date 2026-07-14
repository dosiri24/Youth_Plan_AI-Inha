import json
from dataclasses import dataclass
from typing import TypeAlias

Evidence: TypeAlias = dict[str, str | int]

_EVIDENCE_MARKER = "[[EVIDENCE]]"
_END_MARKER = "[[END_INTERVIEW]]"
_ABORT_MARKER = "[[ABORT_INTERVIEW]]"
_POLES = {"EI": {"E", "I"}, "SN": {"S", "N"}, "TF": {"T", "F"}, "JP": {"J", "P"}}


@dataclass(frozen=True)
class TrailerResult:
    """Represent parsed trailer data and any final safe participant text."""

    text: str
    evidence: list[Evidence]
    ended: bool
    aborted: bool
    issues: list[str]


class TrailerParser:
    """Separate participant text from an incrementally streamed machine trailer."""

    def __init__(self) -> None:
        """Initialize an empty incremental parsing state."""
        self._pending = ""
        self._trailer: list[str] = []
        self._in_trailer = False

    def feed(self, chunk: str) -> str:
        """Return only text proven safe to expose from one stream chunk."""
        if self._in_trailer:
            self._trailer.append(chunk)
            return ""

        combined = self._pending + chunk
        self._pending = ""
        marker_index = combined.find("[[")
        if marker_index >= 0:
            self._in_trailer = True
            self._trailer.append(combined[marker_index:])
            return combined[:marker_index]

        if combined.endswith("["):
            self._pending = "["
            return combined[:-1]
        return combined

    def finish(self, turn: int) -> TrailerResult:
        """Release safe pending text and parse buffered evidence and controls."""
        text = "" if self._in_trailer else self._pending
        self._pending = ""
        trailer = "".join(self._trailer)
        evidence, issues = _parse_evidence(trailer, turn)
        return TrailerResult(
            text=text,
            evidence=evidence,
            ended=_END_MARKER in trailer,
            aborted=_ABORT_MARKER in trailer,
            issues=issues,
        )


def _parse_evidence(trailer: str, turn: int) -> tuple[list[Evidence], list[str]]:
    """Parse and validate the bare evidence array from a complete trailer."""
    if _EVIDENCE_MARKER not in trailer:
        return [], ["evidence_marker_missing"]

    payload = trailer.split(_EVIDENCE_MARKER, 1)[1]
    control_positions = [
        position
        for marker in (_END_MARKER, _ABORT_MARKER)
        if (position := payload.find(marker)) >= 0
    ]
    if control_positions:
        payload = payload[: min(control_positions)]
    payload = _unwrap_fence(payload.strip())

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


def _unwrap_fence(payload: str) -> str:
    """Remove one conventional JSON code fence when the model adds it."""
    if not payload.startswith("```"):
        return payload
    lines = payload.splitlines()
    if len(lines) < 3 or lines[0].strip() not in {"```", "```json"}:
        return payload
    if lines[-1].strip() != "```":
        return payload
    return "\n".join(lines[1:-1]).strip()


def _validate_item(item: object, turn: int) -> Evidence | None:
    """Validate and normalize one evidence item against the Phase 1 schema."""
    if not isinstance(item, dict):
        return None
    axis = item.get("axis")
    pole = item.get("pole")
    weight = item.get("weight")
    text = item.get("text")
    model_turn = item.get("turn")
    if not isinstance(axis, str) or not isinstance(pole, str):
        return None
    if axis not in _POLES or pole not in _POLES[axis]:
        return None
    if type(weight) is not int or weight not in {1, 2, 3}:
        return None
    if not isinstance(text, str) or not text.strip():
        return None
    if type(model_turn) is not int:
        return None
    # The backend owns turn numbering so model arithmetic cannot corrupt the transcript.
    return {"axis": axis, "pole": pole, "weight": weight, "text": text, "turn": turn}
