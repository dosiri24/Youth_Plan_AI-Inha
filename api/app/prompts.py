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
# Topics quote the rubric's four target qualities, so the interviewer maps them without axis names.
AXIS_HINT_TOPICS = {
    "AC": "동네와 거리가 얼마나 활발히 돌아가기를 바라는지",
    "UN": "어떤 풍경 속에서 살고 싶은지",
    "OW": "도시가 무엇을 먼저 챙기기를 바라는지",
    "FH": "도시가 변할 때 무엇을 지키고 무엇을 바꾸기를 바라는지",
}
PacingMode = Literal["continue", "extend", "closing"]


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
    name: Literal["structuring.md", "deidentify.md", "aggregate.md", "briefing.md"],
) -> str:
    """Load one report-pipeline prompt without embedding instructions in code."""
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


@lru_cache
def build_fixed_prefix(age_2040: int) -> str:
    """Build the stable interviewer system instruction for one participant age."""
    system_prompt, rubric = load_prompt_assets()
    # Age is the only per-participant value, so it trails the shared assets to widen cache reuse.
    participant_info = f"[참여자 정보]\n2040년 추정 나이: 약 {age_2040}세"
    # The 2040 plan summary is not here: it was never quoted, and its policy vocabulary
    # pulled the interviewer toward asking a citizen for administrative answers.
    # XML tags mark the section boundaries so the model parses each asset unambiguously.
    return "\n\n".join(
        (
            f"<rubric>\n{rubric}\n</rubric>",
            f"<instructions>\n{system_prompt}\n</instructions>",
            f"<participant_info>\n{participant_info}\n</participant_info>",
        )
    )


def _format_operational_instruction(instructions: Sequence[str]) -> str:
    """Format backend guidance as one operational-instruction block."""
    return f"[운영 지시: {'; '.join(instructions)}]"


def build_opening_instruction() -> str:
    """Build backend guidance for the interview opening."""
    return _format_operational_instruction(("인터뷰를 시작하고 참여자에게 첫 인사를 건넬 것",))


def build_operational_instruction(
    mode: PacingMode,
    hint_topic: str | None = None,
    retry: bool = False,
) -> str:
    """Build one pacing and optional coverage instruction block."""
    if mode == "closing":
        instructions = [_BEGIN_CLOSING]
        if hint_topic:
            instructions.append(
                "덧붙임을 물을 때 다음 성질의 이야기를 좀 더 듣고 싶다고 언급하고 "
                f"그쪽도 열어 둘 것: {hint_topic}"
            )
        return _format_operational_instruction(instructions)

    instructions = [_KEEP_GOING]
    if hint_topic:
        if retry:
            instructions.append(
                "다음 성질의 이야기를 앞서 물었으나 아직 나오지 않았음. 앞선 대화 맥락을 고려하여, "
                "앞서 쓴 장면을 되풀이하지 말고 참여자가 이미 꺼낸 소재에 붙여 "
                f"다른 장면으로 물을 것: {hint_topic}"
            )
        elif mode == "extend":
            instructions.append(
                "다음 성질의 이야기를 오늘 거의 듣지 못했음. 이번 응답에서는 그 성질이 드러날 "
                f"2040년의 장면을 하나 골라 물을 것: {hint_topic}"
            )
        else:
            instructions.append(
                "이번 응답에서는 다음 성질이 드러날 장면을 하나 물어볼 것"
                f"(이미 그 이야기가 나왔다면 따르지 않아도 됨): {hint_topic}"
            )
    return _format_operational_instruction(instructions)


def append_operational_instruction(
    text: str,
    mode: PacingMode,
    hint_topic: str | None = None,
    retry: bool = False,
) -> str:
    """Append backend guidance after every participant utterance."""
    instruction = build_operational_instruction(mode, hint_topic, retry)
    return f"{text}\n{instruction}"
