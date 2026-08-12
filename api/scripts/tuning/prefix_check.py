"""Check the interviewer prefix for leaked scoring vocabulary and report its size."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.prompts import build_fixed_prefix  # noqa: E402

# Vocabulary that belongs to the scoring call only; its presence means the split leaked back.
# "판정" alone is not listed: the interviewer legitimately judges whether an utterance is abusive.
SCORING_WORDS = ("증거", "가중치", "태깅", "유형 판정", "앵커", "축의 이름", "네 개 축", "네 축")
# Axis and pole identifiers the interviewer must never be able to read back.
AXIS_WORDS = ("AC", "UN", "OW", "FH", "axis_hint", "ANSWER_KEY 목록", "생활 리듬", "선호 공간")
# Question templates the round removed; a match means an old block survived the edit.
REMOVED_TEMPLATES = ("한정된 예산", "복합 쇼핑몰", "아니면 조용한", "강한 증거가 됩니다")


def main() -> None:
    """Print the prefix size and every forbidden term still present."""
    prefix = build_fixed_prefix(2040 - 1998)
    print(f"prefix_chars: {len(prefix)}")
    print(f"prefix_lines: {prefix.count(chr(10)) + 1}")

    failures = 0
    for label, words in (
        ("scoring", SCORING_WORDS),
        ("axis", AXIS_WORDS),
        ("removed", REMOVED_TEMPLATES),
    ):
        hits = [word for word in words if word in prefix]
        print(f"{label}_hits: {hits}")
        failures += len(hits)
    print("V0:", "pass" if failures == 0 else f"fail ({failures} terms)")


if __name__ == "__main__":
    main()
