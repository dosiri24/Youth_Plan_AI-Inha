import hashlib
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path
from typing import Literal

_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
_INTERVIEW_PROMPT_NAMES = ("system.md", "rubric.md")
_FINGERPRINT_LENGTH = 12
_KEEP_GOING = "아직 인터뷰를 마무리하지 말고 대화를 계속할 것"
_BEGIN_CLOSING = "인터뷰 루브릭에 설명된 정리 순서로 넘어갈 것"


@lru_cache(maxsize=1)
def prompt_fingerprint() -> dict[str, str]:
    """Identify the exact prompt assets behind a run so measurements stay comparable."""
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()[:_FINGERPRINT_LENGTH]
        for path in sorted(_PROMPT_DIR.glob("*.md"))
    }


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
def load_report_prompt(
    name: Literal["structuring.md", "deidentify.md", "aggregate.md", "insight.md"],
) -> str:
    """Load one report-pipeline prompt without embedding instructions in code."""
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


@lru_cache
def build_fixed_prefix(age_2040: int) -> str:
    """Build the stable Gemini system instruction for one participant age."""
    system_prompt, rubric = load_prompt_assets()
    # Age is the only per-participant value, so it trails the shared assets to widen cache reuse.
    participant_info = f"[참여자 정보]\n2040년 추정 나이: 약 {age_2040}세"
    # The 2040 plan summary is not here: it was never quoted, and its policy vocabulary
    # pulled the interviewer toward asking a citizen for administrative answers.
    return "\n\n".join((rubric, system_prompt, participant_info))


def _format_operational_instruction(instructions: Sequence[str]) -> str:
    """Format backend guidance as one operational-instruction block."""
    return f"[운영 지시: {'; '.join(instructions)}]"


def build_opening_instruction() -> str:
    """Build backend guidance for the interview opening."""
    return _format_operational_instruction(("인터뷰를 시작하고 참여자에게 첫 인사를 건넬 것",))


def build_operational_instruction(turn: int, wrapup_turn: int) -> str:
    """Build one pacing-only operational instruction block."""
    instruction = _BEGIN_CLOSING if turn >= wrapup_turn else _KEEP_GOING
    return _format_operational_instruction((instruction,))


def append_operational_instruction(text: str, turn: int, wrapup_turn: int) -> str:
    """Append backend guidance after every participant utterance."""
    instruction = build_operational_instruction(turn, wrapup_turn)
    return f"{text}\n{instruction}"
