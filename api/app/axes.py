import json
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

AxisDefinition = tuple[str, tuple[str, str], str, str]

_AXES_PATH = Path(__file__).resolve().parents[1] / "prompts" / "axes.md"
_EXPECTED_AXIS_ORDER = ("EI", "SN", "TF", "JP")
_REQUIRED_FIELDS = {"axis", "poles", "default", "display"}


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


def _validate_axes(value: object) -> tuple[AxisDefinition, ...]:
    """Reject axis blocks that do not match the fixed four-axis schema."""
    if not isinstance(value, list) or len(value) != len(_EXPECTED_AXIS_ORDER):
        raise ValueError("axis contract must contain four axes")

    definitions: list[AxisDefinition] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict) or set(item) != _REQUIRED_FIELDS:
            raise ValueError("each axis must contain axis, poles, default, and display")

        axis = item["axis"]
        pole_values = item["poles"]
        default = item["default"]
        display = item["display"]
        if axis != _EXPECTED_AXIS_ORDER[index]:
            raise ValueError("axes must use the fixed EI, SN, TF, JP order")
        if (
            not isinstance(pole_values, list)
            or len(pole_values) != 2
            or not all(isinstance(pole, str) and len(pole) == 1 for pole in pole_values)
        ):
            raise ValueError("each axis must contain two one-letter poles")

        poles = (pole_values[0], pole_values[1])
        if axis != "".join(poles):
            raise ValueError("axis names must match their ordered poles")
        if not isinstance(default, str) or default not in poles:
            raise ValueError("each default must be one of its axis poles")
        if not isinstance(display, str) or display != "/".join(poles):
            raise ValueError("each display must join its poles with a slash")
        definitions.append((axis, poles, default, display))
    return tuple(definitions)


AXES = load_axes()
SCORING_AXES = tuple((axis, poles, default) for axis, poles, default, _display in AXES)
AXIS_POLES = {axis: frozenset(poles) for axis, poles, _default, _display in AXES}
DISPLAY_AXES = tuple((axis, display) for axis, _poles, _default, display in AXES)
