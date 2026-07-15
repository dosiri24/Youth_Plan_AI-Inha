from collections import Counter
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app import knowledge

_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
_PROMPT_NAMES = ("system.md", "rubric.md", "axes.md")
_AXES = (("EI", "E/I"), ("SN", "S/N"), ("TF", "T/F"), ("JP", "J/P"))


@lru_cache(maxsize=1)
def load_prompt_assets() -> tuple[str, str, str]:
    """Load and cache the three Phase 1 prompt assets."""
    return tuple((_PROMPT_DIR / name).read_text(encoding="utf-8") for name in _PROMPT_NAMES)


@lru_cache
def load_report_prompt(name: Literal["compression.md", "structuring.md"]) -> str:
    """Load one Phase 3 report prompt without embedding instructions in code."""
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


@lru_cache
def build_fixed_prefix(age_2040: int) -> str:
    """Build the stable Gemini system instruction for one participant age."""
    system_prompt, rubric, axes = load_prompt_assets()
    system_with_age = f"{system_prompt}\n\n2040년 추정 나이: {age_2040}세"
    return "\n\n".join((system_with_age, rubric, axes, knowledge.load_plan_summary()))


def _format_operational_instruction(instructions: Sequence[str]) -> str:
    """Format backend guidance as one operational-instruction block."""
    return f"[운영 지시: {'; '.join(instructions)}]"


def build_opening_instruction() -> str:
    """Build backend guidance for the interview opening."""
    return _format_operational_instruction(("인터뷰를 시작하고 참여자에게 첫 인사를 건넬 것",))


def build_operational_instruction(
    evidence: Sequence[Mapping[str, object]],
    turn: int,
    wrapup_turn: int,
    target_turns: int,
    axis_min_evidence: int,
) -> str:
    """Build one backend instruction block for coverage and wrap-up guidance."""
    evidence_counts = Counter(item.get("axis") for item in evidence)
    instructions = []
    for axis, display in _AXES:
        count = evidence_counts[axis]
        if count == 0:
            instructions.append(f"아직 {display} 관련 대화가 없음")
        elif count < axis_min_evidence:
            instructions.append(f"{display} 축의 증거가 부족하니 더 탐색할 것")

    if turn >= wrapup_turn:
        remaining = target_turns - turn
        if remaining > 0:
            instructions.append(
                f"목표 {target_turns}턴까지 남은 {remaining}턴 안에 자연스럽게 마무리를 준비할 것"
            )
        else:
            instructions.append(
                f"목표 {target_turns}턴에 도달했으므로 지금부터 자연스럽게 마무리할 것"
            )
    else:
        instructions.append("아직 인터뷰를 마무리하지 말고 대화를 계속할 것")

    if not instructions:
        return ""
    return _format_operational_instruction(instructions)


def append_operational_instruction(
    text: str,
    evidence: Sequence[Mapping[str, object]],
    turn: int,
    wrapup_turn: int,
    target_turns: int,
    axis_min_evidence: int,
) -> str:
    """Append backend guidance after a participant utterance when needed."""
    instruction = build_operational_instruction(
        evidence,
        turn,
        wrapup_turn,
        target_turns,
        axis_min_evidence,
    )
    if not instruction:
        return text
    return f"{text}\n{instruction}"
