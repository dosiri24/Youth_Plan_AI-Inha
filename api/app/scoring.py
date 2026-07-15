from math import floor
from typing import TypedDict

from app.logging import log_event


class Evidence(TypedDict):
    """Define one evidence record consumed by deterministic scoring."""

    axis: str
    pole: str
    weight: int
    text: str
    turn: int


class AxisResult(TypedDict):
    """Define one scored city-value axis."""

    axis: str
    letter: str
    strength: int
    scores: dict[str, int]
    evidence: list[Evidence]


class TypeResult(TypedDict):
    """Define the complete deterministic four-axis type result."""

    code: str
    axes: list[AxisResult]


_AXES = (
    ("EI", ("E", "I"), "I"),
    ("SN", ("S", "N"), "S"),
    ("TF", ("T", "F"), "F"),
    ("JP", ("J", "P"), "J"),
)


def score_type(evidence: list[Evidence], session_id: str) -> TypeResult:
    """Score all axes from validated evidence without an LLM call."""
    axes = [
        _score_axis(axis, poles, default, evidence, session_id) for axis, poles, default in _AXES
    ]
    return {"code": "".join(result["letter"] for result in axes), "axes": axes}


def _score_axis(
    axis: str,
    poles: tuple[str, str],
    default: str,
    evidence: list[Evidence],
    session_id: str,
) -> AxisResult:
    """Apply weight, tie-break, and strength rules to one axis."""
    axis_evidence = [item for item in evidence if item["axis"] == axis]
    scores = {
        pole: sum(item["weight"] for item in axis_evidence if item["pole"] == pole)
        for pole in poles
    }
    if not axis_evidence:
        log_event("empty_axis", session_id=session_id, axis=axis)
        return {
            "axis": axis,
            "letter": default,
            "strength": 51,
            "scores": scores,
            "evidence": axis_evidence,
        }

    winner = _winner(poles, default, scores, axis_evidence)
    total = sum(scores.values())
    strength = max(51, _round_half_up(scores[winner] / total * 100))
    return {
        "axis": axis,
        "letter": winner,
        "strength": strength,
        "scores": scores,
        "evidence": axis_evidence,
    }


def _winner(
    poles: tuple[str, str],
    default: str,
    scores: dict[str, int],
    evidence: list[Evidence],
) -> str:
    """Resolve a winning pole by score, item count, then default."""
    first, second = poles
    if scores[first] != scores[second]:
        return first if scores[first] > scores[second] else second

    counts = {pole: sum(item["pole"] == pole for item in evidence) for pole in poles}
    if counts[first] != counts[second]:
        return first if counts[first] > counts[second] else second
    return default


def _round_half_up(value: float) -> int:
    """Avoid Python's even-number tie behavior at exact half boundaries."""
    return floor(value + 0.5)
