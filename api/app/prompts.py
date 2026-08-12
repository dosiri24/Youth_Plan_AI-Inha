import hashlib
from collections import Counter
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app import bank

_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
_INTERVIEW_PROMPT_NAMES = ("system.md", "rubric.md")
_FINGERPRINT_LENGTH = 12
_KEEP_GOING = "아직 인터뷰를 마무리하지 말고 대화를 계속할 것"

# The opening greeting already asks what to call the participant, so these follow it.
# Without them the question bank starts at turn one and pushes the intro out of the interview.
INTRO_STEPS = (
    "알려 준 이름으로 부르면서 인천 어디에 사는지만 물을 것",
    "요즘 무엇을 하며 지내는지만 묻고, 2040년에 몇 살쯤 되는지 한마디로 언급할 것",
)

# The closing turns after the priority question, each with exactly one answer slot.
CLOSING_STEPS = (
    "그것이 먼저였으면 하는 이유만 물을 것",
    "참여자가 한 이야기를 두세 문장으로 정리한 뒤, 빠뜨렸거나 덧붙이고 싶은 말이 있는지 물을 것",
    "질문하지 말고 담백하게 감사한 뒤 인터뷰를 마칠 것",
)


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


def build_operational_instruction(
    evidence: Sequence[Mapping[str, object]],
    turn: int,
    wrapup_turn: int,
    asked_keys: dict[str, int],
    answered_keys: dict[str, int],
) -> tuple[str, bank.Question | None]:
    """Build one instruction block and name the question slot it hands over."""
    if turn == wrapup_turn:
        return _question_instruction(bank.CLOSING_PRIORITY), bank.CLOSING_PRIORITY

    if turn > wrapup_turn:
        step = closing_step(turn, wrapup_turn, answered_keys)
        return _format_operational_instruction((CLOSING_STEPS[step],)), None

    if turn <= len(INTRO_STEPS):
        return _format_operational_instruction((INTRO_STEPS[turn - 1], _KEEP_GOING)), None

    counts = Counter(item.get("axis") for item in evidence)
    question = bank.next_question(counts, asked_keys, answered_keys)
    if question is None:
        return _format_operational_instruction((_KEEP_GOING,)), None
    return _question_instruction(question), question


def closing_step(turn: int, wrapup_turn: int, answered_keys: dict[str, int]) -> int:
    """Return which closing step one turn runs, skipping a reason with nothing to explain."""
    offset = turn - wrapup_turn
    answered = bank.CLOSING_PRIORITY.answer_key in answered_keys
    return min(offset - 1 if answered else offset, len(CLOSING_STEPS) - 1)


def termination_allowed(turn: int, wrapup_turn: int, answered_keys: dict[str, int]) -> bool:
    """Report whether the participant has already answered the final-remarks question."""
    if turn <= wrapup_turn:
        return False
    return closing_step(turn, wrapup_turn, answered_keys) >= len(CLOSING_STEPS) - 1


def _question_instruction(question: bank.Question) -> str:
    """Hand over one answer slot and the exact sentence that opens it."""
    return _format_operational_instruction(
        (
            f"ANSWER_KEY={question.answer_key}; "
            f'이 문장을 낱말과 어순을 바꾸지 말고 그대로 한 번만 물을 것: "{question.text}"',
            _KEEP_GOING,
        )
    )


def append_operational_instruction(
    text: str,
    evidence: Sequence[Mapping[str, object]],
    turn: int,
    wrapup_turn: int,
    asked_keys: dict[str, int],
    answered_keys: dict[str, int],
) -> tuple[str, bank.Question | None]:
    """Append backend guidance after every participant utterance."""
    instruction, question = build_operational_instruction(
        evidence,
        turn,
        wrapup_turn,
        asked_keys,
        answered_keys,
    )
    return f"{text}\n{instruction}", question
