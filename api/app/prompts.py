from collections import Counter
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app import knowledge
from app.axes import DISPLAY_AXES

_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
_INTERVIEW_PROMPT_NAMES = ("system.md", "rubric.md")


@lru_cache(maxsize=1)
def load_prompt_assets() -> tuple[str, str]:
    """Load and cache the interviewer prompt assets."""
    return tuple(
        (_PROMPT_DIR / name).read_text(encoding="utf-8") for name in _INTERVIEW_PROMPT_NAMES
    )


@lru_cache(maxsize=1)
def load_scoring_instruction() -> str:
    """Load and cache axes.md as the scoring system instruction."""
    return (_PROMPT_DIR / "axes.md").read_text(encoding="utf-8")


@lru_cache
def load_report_prompt(name: Literal["structuring.md"]) -> str:
    """Load one Phase 3 report prompt without embedding instructions in code."""
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


@lru_cache
def build_fixed_prefix(age_2040: int) -> str:
    """Build the stable Gemini system instruction for one participant age."""
    system_prompt, rubric = load_prompt_assets()
    # Age is the only per-participant value, so it trails the shared assets to widen cache reuse.
    participant_info = f"[참여자 정보]\n2040년 추정 나이: 약 {age_2040}세"
    # Background leads, then the rubric; conduct and response format stay closest to generation.
    return "\n\n".join(
        (knowledge.load_plan_summary(), rubric, system_prompt, participant_info)
    )


def _coverage_target(
    evidence_counts: Counter,
    turn: int,
    axis_min_evidence: int,
) -> tuple[int, str] | None:
    """Name at most one axis per turn because the interviewer may ask only one question."""
    thin = [
        (evidence_counts[axis], display)
        for axis, display in DISPLAY_AXES
        if evidence_counts[axis] < axis_min_evidence
    ]
    if not thin:
        return None
    lowest = min(count for count, _display in thin)
    group = [item for item in thin if item[0] == lowest]
    # Rotate among equally thin axes so one that keeps yielding nothing cannot block the rest.
    return group[(turn - 1) % len(group)]


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
    undiscussed = [display for axis, display in DISPLAY_AXES if evidence_counts[axis] == 0]
    instructions = []
    target = _coverage_target(evidence_counts, turn, axis_min_evidence)
    if target is not None:
        count, display = target
        instructions.append(
            f"아직 {display} 관련 대화가 없으니 그 주제를 먼저 다룰 것"
            if count == 0
            else f"{display} 축의 증거가 부족하니 더 탐색할 것"
        )

    if turn < wrapup_turn:
        instructions.append("아직 인터뷰를 마무리하지 말고 대화를 계속할 것")
    elif undiscussed:
        # Wrapping up with an untouched axis contradicts the coverage rule the prompts state.
        instructions.append(
            "마무리 시점이지만 다루지 못한 축이 남았으니 마무리하지 말고 위 주제를 먼저 물을 것"
        )
    elif turn < target_turns:
        remaining = target_turns - turn
        instructions.append(
            f"목표 {target_turns}턴까지 남은 {remaining}턴 안에 자연스럽게 마무리를 준비할 것"
        )
    else:
        instructions.append(f"목표 {target_turns}턴에 도달했으므로 지금부터 자연스럽게 마무리할 것")

    return _format_operational_instruction(instructions)


def append_operational_instruction(
    text: str,
    evidence: Sequence[Mapping[str, object]],
    turn: int,
    wrapup_turn: int,
    target_turns: int,
    axis_min_evidence: int,
) -> str:
    """Append backend guidance after every participant utterance."""
    instruction = build_operational_instruction(
        evidence,
        turn,
        wrapup_turn,
        target_turns,
        axis_min_evidence,
    )
    return f"{text}\n{instruction}"
