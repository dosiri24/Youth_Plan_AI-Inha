"""Hold the closed word lists the interview loop and the tuning parser both read.

One definition serves four places by design: the prompt instruction, the runtime guard, the
offline parser, and the labelling guide. Two copies would drift and the measurements with them.
"""

# Layer two of the one-answer-slot rule: a closed set, so an enumeration cannot leak.
WH_WORDS = (
    "어디",
    "무엇",
    "누구",
    "언제",
    "어떻게",
    "어떤",
    "얼마나",
    "왜",
    "몇",
    "뭐",
)

# Surface marks of a two-option question, which the prompts forbid outright.
BINARY_MARKS = (
    "아니면",
    "중에",
    "중 어디",
    "둘 중",
    "어느 쪽",
    "우선순위",
    "한정된",
    "포기",
    "가장 먼저",
    "먼저일까",
)

# Abstract nouns a citizen cannot answer with something they saw or did.
ABSTRACT_WORDS = ("속도", "간격", "공기", "풍경", "분위기", "감각", "템포", "정취")

# Administrative vocabulary that turns a resident into a policy translator.
POLICY_WORDS = (
    "투자",
    "기반",
    "경쟁력",
    "재원",
    "예산",
    "인프라",
    "정책",
    "사업",
    "조성",
    "확충",
    "지원책",
)

# The two poles of every axis, which a question must never hand to the participant.
POLE_WORDS = (
    "붐비",
    "북적",
    "활기",
    "한산",
    "조용",
    "여유",
    "번화",
    "도시적",
    "자연",
    "녹지",
    "기회",
    "성장",
    "경쟁",
    "돌봄",
    "복지",
    "취약",
    "새롭",
    "신설",
    "정비",
    "보존",
    "오래된",
)

# Praise and scale words that mark an interviewer adding an evaluation of its own.
EVALUATIVE_WORDS = (
    "따뜻",
    "온기",
    "정겹",
    "애정",
    "귀하",
    "소중",
    "설레",
    "흥미",
    "낭만",
    "생동",
    "멋지",
    "훌륭",
    "아름",
    "풍성",
    "든든",
    "평화",
    "깊이",
    "간절",
    "뭉클",
    "선명",
)

# Endings that mark a generated restatement of the participant's last utterance.
RESTATEMENT_ENDINGS = ("시군요", "셨군요", "이시네요", "는군요", "군요", "네요", "말씀이시")

# Surface forms that demand an answer, which must not share a turn with termination.
ANSWER_DEMANDS = ("?", "세요", "십시오", "을까요", "ㄹ까요", "나요", "주시겠", "가요", "인가요")

# Marks of the final-remarks question every participant must get before the interview closes.
LAST_CHANCE_MARKS = ("덧붙이", "빠뜨린", "빠진", "더 하고 싶은", "남기고 싶은", "더 전하고 싶은")

# A long answer that happens to contain "잘 모르겠어요" is still an answer, so a refusal has to
# be short as well as marked. Measured against the lab records, where refusals run under 40 chars.
REFUSAL_MAX_CHARS = 40

# Ways a participant signals they cannot or will not answer, which must close the topic.
REFUSAL_MARKS = (
    "모르겠",
    "잘 몰라",
    "잘 모르",
    "글쎄",
    "딱히",
    "생각 안",
    "생각해본 적",
    "없어요",
    "없습니다",
    "패스",
)

# A participant may leave at any point, and the interviewer must be allowed to close there.
STOP_MARKS = ("그만", "종료", "끝낼", "끝내", "여기까지", "안 할래", "안할래")

# Particles and suffixes stripped to compare an interviewer word with a participant word.
PARTICLES = (
    "이라고",
    "라고",
    "에서는",
    "에서도",
    "에게서",
    "으로는",
    "처럼",
    "부터",
    "까지",
    "이랑",
    "에서",
    "에게",
    "으로",
    "보다",
    "만큼",
    "이나",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "로",
    "와",
    "과",
    "도",
    "만",
    "랑",
    "의",
    "님",
    "씨",
)

# Function words shared by every interview, so counting them as new words means nothing.
FUNCTION_WORDS = frozenset(
    {
        "그런",
        "이런",
        "저런",
        "그것",
        "이것",
        "무엇",
        "어떤",
        "어디",
        "누구",
        "언제",
        "얼마",
        "정말",
        "혹시",
        "지금",
        "다시",
        "조금",
        "가장",
        "먼저",
        "함께",
        "그리고",
        "그러면",
        "그런데",
        "말씀",
        "이야기",
        "질문",
        "생각",
        "궁금",
        "인천",
        "대화",
        "감사",
        "안녕",
        "참여",
        "하늘",
        "인터뷰",
        "인터뷰어",
        "저는",
        "제가",
        "우리",
        "당신",
        "여기",
        "거기",
        "저기",
        "때문",
        "정도",
        "경우",
        "부분",
        "모습",
        "이제",
        "오늘",
        "하루",
        "시간",
    }
)
