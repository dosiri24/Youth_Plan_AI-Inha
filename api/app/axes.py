import json
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

AxisDefinition = tuple[str, tuple[str, str], str, str, dict[str, str]]

_AXES_PATH = Path(__file__).resolve().parents[1] / "prompts" / "axes.md"
_AXIS_COUNT = 4
_REQUIRED_FIELDS = {"axis", "poles", "default", "display", "names"}
_DEFINITIONS_START = "## 4축 정의"
_DEFINITIONS_END = "## 채점 앵커"


class Evidence(TypedDict):
    """Define one validated evidence record."""

    axis: str
    pole: str
    weight: int
    text: str
    turn: int


EVIDENCE_WEIGHTS = frozenset({1, 2, 3})


@lru_cache(maxsize=1)
def load_axes() -> tuple[AxisDefinition, ...]:
    """Load and validate the machine-readable axis contract once."""
    markdown = _AXES_PATH.read_text(encoding="utf-8")
    _, marker, remainder = markdown.partition("```json")
    if not marker:
        raise ValueError("axes.md must contain a JSON code fence")
    payload, closing, _ = remainder.partition("```")
    if not closing:
        raise ValueError("axes.md JSON code fence must be closed")
    return _validate_axes(json.loads(payload))


@lru_cache(maxsize=1)
def load_definitions() -> str:
    """Extract the axis and pole definitions so other calls share one source of truth."""
    markdown = _AXES_PATH.read_text(encoding="utf-8")
    _, marker, remainder = markdown.partition(_DEFINITIONS_START)
    if not marker:
        raise ValueError("axes.md must contain an axis definition section")
    body, closing, _ = remainder.partition(_DEFINITIONS_END)
    if not closing:
        raise ValueError("axes.md axis definition section must be closed")
    return f"{_DEFINITIONS_START}{body}".strip()


def _validate_axes(value: object) -> tuple[AxisDefinition, ...]:
    """Reject axis blocks that do not match the fixed four-axis schema."""
    if not isinstance(value, list) or len(value) != _AXIS_COUNT:
        raise ValueError("axis contract must contain four axes")

    definitions: list[AxisDefinition] = []
    for item in value:
        if not isinstance(item, dict) or set(item) != _REQUIRED_FIELDS:
            raise ValueError("each axis must contain axis, poles, default, display, and names")

        axis = item["axis"]
        pole_values = item["poles"]
        default = item["default"]
        display = item["display"]
        names = item["names"]
        if (
            not isinstance(pole_values, list)
            or len(pole_values) != 2
            or not all(isinstance(pole, str) and len(pole) == 1 for pole in pole_values)
        ):
            raise ValueError("each axis must contain two one-letter poles")

        poles = (pole_values[0], pole_values[1])
        if not isinstance(axis, str) or axis != "".join(poles):
            raise ValueError("axis names must match their ordered poles")
        if not isinstance(default, str) or default not in poles:
            raise ValueError("each default must be one of its axis poles")
        if not isinstance(display, str) or not display.strip():
            raise ValueError("each display must be a non-empty name")
        if not isinstance(names, dict) or set(names) != set(poles):
            raise ValueError("each names map must match its axis poles")
        if not all(isinstance(name, str) and name.strip() for name in names.values()):
            raise ValueError("each pole name must be a non-empty string")
        definitions.append((axis, poles, default, display, dict(names)))

    # A repeated letter would make a four-position type code ambiguous to read back.
    letters = [pole for _axis, poles, _default, _display, _names in definitions for pole in poles]
    if len(set(letters)) != len(letters):
        raise ValueError("every pole letter must be unique across all axes")
    return tuple(definitions)


AXES = load_axes()
AXIS_NAMES = tuple(axis for axis, _poles, _default, _display, _names in AXES)
SCORING_AXES = tuple((axis, poles, default) for axis, poles, default, _display, _names in AXES)
AXIS_POLES = {axis: frozenset(poles) for axis, poles, _default, _display, _names in AXES}
DISPLAY_AXES = tuple((axis, display) for axis, _poles, _default, display, _names in AXES)
POLE_NAMES: dict[str, str] = {
    pole: names[pole] for _axis, poles, _default, _display, names in AXES for pole in poles
}
