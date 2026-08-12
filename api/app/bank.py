"""Hold the reviewed questions the backend hands out one answer slot at a time."""

from typing import NamedTuple


class Question(NamedTuple):
    """Define one reviewed question, the axis it feeds, and what must precede it."""

    answer_key: str
    text: str
    # Backend-only. Serializing this would let the interviewer read the axis off the question.
    coverage_axis: str
    requires: str | None


# The closing question. It is a reviewed sentence like any other, but it is not in the pool:
# the backend asks it once, at the wrap-up turn, out of everything the participant has said.
CLOSING_PRIORITY = Question(
    "closing_priority",
    "지금까지 말씀해 주신 것 가운데 딱 하나만 먼저 이뤄진다면 어떤 게 좋으시겠어요?",
    "",
    None,
)

# The order is the rotation order: morning, doorstep, day and evening, then places in Incheon.
QUESTIONS = (
    Question(
        "morning_wake_time",
        "2040년 쉬는 날 아침에는 몇 시쯤 눈을 뜨면 좋겠어요?",
        "AC",
        None,
    ),
    Question(
        "morning_current_action",
        "요즘 쉬는 날에는 눈을 뜬 뒤 무엇을 하세요?",
        "AC",
        None,
    ),
    Question(
        "morning_sound",
        "2040년 아침에 창밖에서 무슨 소리를 듣고 싶으세요?",
        "AC",
        None,
    ),
    Question(
        "morning_reason",
        "그런 아침을 바라는 이유는 무엇인가요?",
        "AC",
        "morning_sound",
    ),
    Question(
        "space_visible_item",
        "2040년에 집을 나서면 눈앞에 무엇이 보이면 좋겠어요?",
        "UN",
        None,
    ),
    Question(
        "space_current_rest_place",
        "쉴 때 주로 어디로 가세요?",
        "UN",
        None,
    ),
    Question(
        "space_place_reason",
        "그곳에는 왜 가세요?",
        "UN",
        "space_current_rest_place",
    ),
    Question(
        "space_future_spare_action",
        "2040년에 잠깐 시간이 비면 무엇을 하며 보내시겠어요?",
        "UN",
        None,
    ),
    Question(
        "day_current_place",
        "요즘 낮에는 주로 어디에서 시간을 보내세요?",
        "OW",
        None,
    ),
    Question(
        "day_future_action",
        "2040년에는 낮에 무슨 일을 하고 있으면 좋겠어요?",
        "OW",
        None,
    ),
    Question(
        "evening_current_action",
        "하루 일이 끝난 뒤에는 보통 무엇을 하세요?",
        "OW",
        None,
    ),
    Question(
        "hard_day_response",
        "힘든 일이 있으면 보통 어떻게 하세요?",
        "OW",
        None,
    ),
    Question(
        "incheon_shared_visit_place",
        "인천에 온 지인과 함께 가 본 곳이 있다면 어디였어요?",
        "FH",
        None,
    ),
    Question(
        "incheon_shared_visit_reason",
        "그곳을 함께 간 까닭은 무엇인가요?",
        "FH",
        "incheon_shared_visit_place",
    ),
    Question(
        "incheon_recent_visit_place",
        "최근 일부러 찾아간 인천의 장소는 어디였어요?",
        "FH",
        None,
    ),
    Question(
        "incheon_recent_visit_reason",
        "그곳을 일부러 찾아간 건 왜였어요?",
        "FH",
        "incheon_recent_visit_place",
    ),
)


def next_question(
    evidence_counts: dict[str, int],
    asked_keys: dict[str, int],
    answered_keys: dict[str, int],
) -> Question | None:
    """Pick the follow-up to the last answer, else the open question feeding the thinnest axis."""
    # "그곳에는 왜 가세요?" only makes sense in the turn right after that place was named.
    if answered_keys:
        last_answered = next(reversed(answered_keys))
        follow_up = next(
            (
                question
                for question in QUESTIONS
                if question.requires == last_answered and question.answer_key not in asked_keys
            ),
            None,
        )
        if follow_up is not None:
            return follow_up

    available = [
        question
        for question in QUESTIONS
        if question.requires is None and question.answer_key not in asked_keys
    ]
    if not available:
        return None
    return min(available, key=lambda question: evidence_counts.get(question.coverage_axis, 0))
