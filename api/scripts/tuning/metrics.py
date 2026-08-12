"""Score interviewer behaviour on a fixed transcript corpus without calling any model."""

import json
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.lexicon import (  # noqa: E402
    ABSTRACT_WORDS,
    ANSWER_DEMANDS,
    BINARY_MARKS,
    EVALUATIVE_WORDS,
    FUNCTION_WORDS,
    LAST_CHANCE_MARKS,
    PARTICLES,
    POLE_WORDS,
    POLICY_WORDS,
    REFUSAL_MARKS,
    RESTATEMENT_ENDINGS,
    WH_WORDS,
)

LAB_DIR = Path(__file__).resolve().parents[3] / "docs" / "interview-lab"
CORPUS_PATH = LAB_DIR / "corpus.json"
BASELINE_PATH = LAB_DIR / "baseline-metrics.json"

_SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")
_HANGUL_RUN = re.compile(r"[가-힣]{2,}")
# A conditional clause supplies context, not an answer slot, so its wh-word is not counted.
_CONDITIONAL = re.compile(r"(면|때|라면|거든)\s")
# A Korean question often ends in a polite request instead of a question mark, so both count.
# The ending must close the sentence: "그려주셨네요" restates, while "그려 주세요" demands.
_DEMAND_TAIL = re.compile(
    r"(주세요|주십시오|주시겠어요|주시겠습니까|주실까요|궁금합니다|궁금해요|궁금하네요"
    r"|궁금해집니다|궁금해지네요|여쭙고 싶습니다|듣고 싶습니다)[.!]?$"
)


def score(records: list[dict]) -> dict[str, object]:
    """Return per-record and aggregate interviewer metrics for one corpus."""
    scored = [_score_record(record) for record in records]
    return {"records": scored, "aggregate": _aggregate(scored)}


def _score_record(record: dict) -> dict[str, object]:
    """Score every interviewer utterance in one interview against the participant's words."""
    messages = record["messages"]
    spoken: set[str] = set()
    turns = []
    questions = []

    for message in messages:
        if message["role"] == "user":
            spoken |= _stems(message["text"])
            continue
        text = message["text"]
        # The cumulative comparison is what separates a normal restatement from an invention.
        new_words = sorted(_stems(text) - spoken - FUNCTION_WORDS)
        turns.append(
            {
                "turn": message["turn"],
                "question_marks": text.count("?"),
                "answer_slots": sum(
                    1 for sentence in _sentences(text) if _demands_answer(sentence)
                ),
                "wh_count": _wh_count(text),
                "binary_marks": _hits(text, BINARY_MARKS),
                "sentences": len(_sentences(text)),
                "chars": len(text),
                "restatement": bool(_hits(text, RESTATEMENT_ENDINGS)),
                "new_words": new_words,
                "evaluative_new_words": [
                    word for word in new_words if any(seed in word for seed in EVALUATIVE_WORDS)
                ],
                "abstract": _hits(text, ABSTRACT_WORDS),
                "policy": _hits(text, POLICY_WORDS),
                "pole": _hits(text, POLE_WORDS),
            }
        )
        questions.extend(
            sentence for sentence in _sentences(text) if any(_hits(sentence, WH_WORDS + ("?",)))
        )

    last = messages[-1]["text"] if messages else ""
    return {
        "name": record["name"],
        "multi_slot_turns": sum(1 for turn in turns if turn["answer_slots"] >= 2),
        "turns": turns,
        "similar_question_pairs": _similar_pairs(questions),
        "reasks_after_refusal": _reasks_after_refusal(messages),
        "closing_demands_answer": bool(_hits(last, ANSWER_DEMANDS)),
        "last_chance_given": _last_chance_given(messages),
    }


def _reasks_after_refusal(messages: list[dict]) -> int:
    """Count the refusals whose topic the interviewer brought straight back."""
    reasks = 0
    for index, message in enumerate(messages):
        if message["role"] != "user" or not _hits(message["text"], REFUSAL_MARKS):
            continue
        before = next(
            (item["text"] for item in reversed(messages[:index]) if item["role"] == "assistant"),
            "",
        )
        after = next(
            (item["text"] for item in messages[index + 1 :] if item["role"] == "assistant"),
            "",
        )
        topic = (_stems(before) & _stems(after)) - FUNCTION_WORDS
        # Two shared content words is the smallest overlap that still names the same subject.
        reasks += len(topic) >= 2
    return reasks


def _last_chance_given(messages: list[dict]) -> bool:
    """Report whether the participant was asked for final remarks and could still answer."""
    return any(
        message["role"] == "assistant"
        and _hits(message["text"], LAST_CHANCE_MARKS)
        and any(later["role"] == "user" for later in messages[index + 1 :])
        for index, message in enumerate(messages)
    )


def _aggregate(scored: list[dict]) -> dict[str, float]:
    """Collapse per-turn measures into the twelve comparable round-level numbers."""
    turns = [turn for record in scored for turn in record["turns"]]
    total = len(turns)
    new_word_counts = [len(turn["new_words"]) for turn in turns]
    new_word_total = sum(new_word_counts)
    return {
        "interviewer_turns": total,
        "multi_slot_rate": _rate(turns, lambda turn: turn["answer_slots"] >= 2),
        "multi_question_rate": _rate(turns, lambda turn: turn["question_marks"] >= 2),
        "multi_wh_rate": _rate(turns, lambda turn: turn["wh_count"] >= 2),
        "binary_mark_rate": _rate(turns, lambda turn: bool(turn["binary_marks"])),
        "restatement_rate": _rate(turns, lambda turn: turn["restatement"]),
        "abstract_rate": _rate(turns, lambda turn: bool(turn["abstract"])),
        "policy_rate": _rate(turns, lambda turn: bool(turn["policy"])),
        "pole_rate": _rate(turns, lambda turn: bool(turn["pole"])),
        "median_sentences": _median([turn["sentences"] for turn in turns]),
        "median_chars": _median([turn["chars"] for turn in turns]),
        "median_new_words": _median(new_word_counts),
        "p90_new_words": _percentile(new_word_counts, 0.9),
        "evaluative_new_word_share": round(
            sum(len(turn["evaluative_new_words"]) for turn in turns) / new_word_total, 4
        )
        if new_word_total
        else 0.0,
        "similar_question_pairs": sum(record["similar_question_pairs"] for record in scored),
        "reasks_after_refusal": sum(record["reasks_after_refusal"] for record in scored),
        "closing_demands_answer": sum(1 for record in scored if record["closing_demands_answer"]),
        "last_chance_given": sum(1 for record in scored if record["last_chance_given"]),
        "records": len(scored),
    }


def _sentences(text: str) -> list[str]:
    """Split one utterance into sentences without losing terminal punctuation."""
    return [match.group().strip() for match in _SENTENCE.finditer(text) if match.group().strip()]


def _demands_answer(sentence: str) -> bool:
    """Report whether one sentence opens an answer slot the participant must fill."""
    return "?" in sentence or bool(_DEMAND_TAIL.search(sentence.strip()))


def _wh_count(text: str) -> int:
    """Count main-clause interrogatives, which are candidates for a second answer slot."""
    return sum(
        len(_hits(clause, WH_WORDS))
        for sentence in _sentences(text)
        for clause in _CONDITIONAL.split(sentence)[-1:]
    )


def _hits(text: str, words: tuple[str, ...]) -> list[str]:
    """Return every listed word present in one span of text."""
    return [word for word in words if word in text]


def _stems(text: str) -> set[str]:
    """Reduce Hangul runs to comparable stems so particles cannot fake a new word."""
    stems = set()
    for run in _HANGUL_RUN.findall(text):
        stripped = run
        for particle in PARTICLES:
            if stripped.endswith(particle) and len(stripped) - len(particle) >= 2:
                stripped = stripped[: -len(particle)]
                break
        stems.add(stripped)
    return stems


def _similar_pairs(questions: list[str]) -> int:
    """Count question pairs whose content words overlap enough to read as the same question."""
    sets = [_stems(question) - FUNCTION_WORDS for question in questions]
    return sum(
        1
        for index, first in enumerate(sets)
        for second in sets[index + 1 :]
        # Korean inflection keeps overlap low, so this stays a candidate screen, not a verdict.
        if first and second and len(first & second) / len(first | second) >= 0.2
    )


def _rate(turns: list[dict], predicate) -> float:
    """Return the share of interviewer turns matching one predicate."""
    return round(sum(1 for turn in turns if predicate(turn)) / len(turns), 4) if turns else 0.0


def _median(values: list[int]) -> float:
    """Return the median, which resists the few very long turns in the corpus."""
    return round(statistics.median(values), 2) if values else 0.0


def _percentile(values: list[int], ratio: float) -> float:
    """Return one upper-tail cut so a shrinking worst case is visible."""
    if not values:
        return 0.0
    ordered = sorted(values)
    return float(ordered[min(int(len(ordered) * ratio), len(ordered) - 1)])


def main() -> None:
    """Score the frozen corpus and store it as the pre-change baseline."""
    corpus_path = Path(sys.argv[1]) if len(sys.argv) > 1 else CORPUS_PATH
    result = score(json.loads(corpus_path.read_text(encoding="utf-8")))
    output = (
        BASELINE_PATH if corpus_path == CORPUS_PATH else corpus_path.with_suffix(".metrics.json")
    )
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    for key, value in result["aggregate"].items():
        print(f"{key}: {value}")
    print(f"-> {output}")


if __name__ == "__main__":
    main()
