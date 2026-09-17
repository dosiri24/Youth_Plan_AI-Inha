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
# Topics describe each axis in plain words; the rubric no longer enumerates them,
# so runtime hints are the interviewer's only source of coverage targets.
AXIS_HINT_TOPICS = {
    "AC": "동네와 거리가 얼마나 활발히 돌아가기를 바라는지",
    "UN": "어떤 풍경 속에서 살고 싶은지",
    "OW": "도시가 무엇을 먼저 챙기기를 바라는지",
    "FH": "도시가 변해 갈 때 어떤 방식이기를 바라는지",
}
# Field observations showed abstract topics copied verbatim, so opener guidance stays separate.
AXIS_HINT_OPENERS: dict[str, str] = {
    "FH": (
        "이 성질은 루브릭의 '지금 거기 있는 것' 질문으로 엶. 참여자가 직접 꺼낸 장소나 "
        "참여자가 생기길 바란 시설의 자리를 대상으로 삼음"
    ),
}
# A retry that reuses the first device reads as the same question; each axis gets a
# second device drawn from scenes and questions the rubric already owns. AC and UN name
# no fixed scene because the first attempt tends to pick that very scene on its own.
AXIS_HINT_RETRY_OPENERS: dict[str, str] = {
    "AC": "이번에는 루브릭 장면 목록에서 아직 열지 않은 장면 하나를 골라 엶",
    "UN": "이번에는 루브릭 장면 목록에서 아직 열지 않은 장면 하나를 골라 엶",
    "OW": (
        "이번에는 루브릭의 '2045년에 일어나 있지 않았으면 하는 일' 질문으로 엶"
        + "(아직 하지 않았다면)"
    ),
    "FH": (
        "이번에는 루브릭의 '지금은 없는데 2045년에 생겨 있으면 하는 것' 질문으로 엶"
        "(아직 하지 않았다면)"
    ),
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


@lru_cache(maxsize=1)
def load_nearest_instruction() -> str:
    """Combine the scoring and nearest-judgement system instructions."""
    nearest = (_PROMPT_DIR / "nearest.md").read_text(encoding="utf-8")
    return f"{load_scoring_instruction()}\n\n{nearest}"


@lru_cache
def load_report_prompt(
    name: Literal[
        "structuring.md",
        "extra.md",
        "sectors.md",
        "deidentify.md",
        "aggregate.md",
        "briefing.md",
    ],
) -> str:
    """Load one report-pipeline prompt without embedding instructions in code."""
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


@lru_cache
def build_fixed_prefix(age_2045: int) -> str:
    """Build the stable interviewer system instruction for one participant age."""
    system_prompt, rubric = load_prompt_assets()
    # Age is the only per-participant value, so it trails the shared assets to widen cache reuse.
    participant_info = f"[참여자 정보]\n2045년 추정 나이: 약 {age_2045}세"
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
    hint_axis: str | None = None,
    retry: bool = False,
) -> str:
    """Build one pacing and optional coverage instruction block."""
    if mode == "closing":
        if hint_axis is None:
            instructions = [_BEGIN_CLOSING]
        else:
            hint_topic = AXIS_HINT_TOPICS[hint_axis]
            instructions = [
                "정리 순서에 들어가기 전에, 이번 응답에서 다음 성질이 드러날 2045년의 장면 하나를 "
                "마지막 질문으로 물을 것. 장면은 참여자가 세운 2045년의 무대 위에서 고르고, 방금 "
                "답을 받는 문장으로 시작할 것. 그 답을 받은 다음 응답부터 인터뷰 루브릭에 설명된 "
                f"정리 순서로 넘어갈 것: {hint_topic}"
            ]
        return _format_operational_instruction(instructions)

    instructions = [_KEEP_GOING]
    if hint_axis:
        hint_topic = AXIS_HINT_TOPICS[hint_axis]
        if retry:
            instructions.append(
                "다음 성질의 이야기를 앞서 물었으나 아직 나오지 않았음. 방금 답을 받는 문장으로 "
                "시작하고, 참여자가 이미 꺼낸 소재 위에서 앞서 쓴 것과 다른 장면 하나를 열어 "
                f"물을 것: {hint_topic}"
            )
        else:
            instructions.append(
                "이번 응답에서는 방금 답을 받는 문장으로 시작한 뒤, 그 답에서 이어지는 자리에 "
                "다음 성질이 드러날 2045년의 장면 하나를 붙여 물을 것. 장면은 참여자가 세운 "
                "2045년의 무대 위에서 고를 것. 방금 답에 뜻을 확인해야 할 뭉뚱그린 말이 있으면 "
                "그 확인을 이번 응답에서 하고 이 장면은 다음 기회에 열 것: "
                f"{hint_topic}"
            )
        openers = AXIS_HINT_RETRY_OPENERS if retry else AXIS_HINT_OPENERS
        if opener := openers.get(hint_axis):
            instructions.append(opener)
    return _format_operational_instruction(instructions)


def append_operational_instruction(
    text: str,
    mode: PacingMode,
    hint_axis: str | None = None,
    retry: bool = False,
) -> str:
    """Append backend guidance after every participant utterance."""
    instruction = build_operational_instruction(mode, hint_axis, retry)
    return f"{text}\n{instruction}"
