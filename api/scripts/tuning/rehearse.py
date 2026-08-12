"""Run one full interview against the real backend contract without spending Gemini credit.

The prefix, operational instructions, question bank, trailer parsing, termination gate, and
scoring aggregation are the production code paths. Only the three model calls are redirected
to the local Claude CLI, so a rehearsal costs nothing on the interview provider.

  python3 api/scripts/tuning/rehearse.py 야간노동자 1997
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app import bank, prompts, scoring  # noqa: E402
from app.interview import is_refusal  # noqa: E402
from app.trailer import TrailerParser  # noqa: E402

LAB_DIR = Path(__file__).resolve().parents[3] / "docs" / "interview-lab"
PERSONA_DIR = Path(__file__).resolve().parent / "personas"
OUTPUT_PATH = LAB_DIR / "rehearsal.json"

WRAPUP_TURN = 12
TARGET_TURNS = 15
MAX_TURNS = 20
MODEL = "sonnet"
MODEL_CALL_TIMEOUT_SECONDS = 900
_JSON_ARRAY = re.compile(r"\[.*\]", re.DOTALL)


def ask(system_prompt: str, user_prompt: str) -> str:
    """Run one stateless model call through the local CLI."""
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(system_prompt)
        system_path = handle.name
    try:
        completed = subprocess.run(
            [
                "claude",
                "-p",
                "--system-prompt-file",
                system_path,
                "--model",
                MODEL,
                "--max-turns",
                "1",
                user_prompt,
            ],
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            timeout=MODEL_CALL_TIMEOUT_SECONDS,
            check=True,
        )
    finally:
        Path(system_path).unlink()
    return completed.stdout.strip()


def _dialogue(messages: list[dict]) -> str:
    """Render the transcript the way a single-prompt call can still read it."""
    labels = {"user": "참여자", "assistant": "인터뷰어"}
    return "\n".join(f"{labels[item['role']]}: {item['text']}" for item in messages)


def _interview_turn(messages: list[dict], age: int, assembled: str) -> tuple[str, bool, bool]:
    """Produce one interviewer response through the real prefix and trailer parser."""
    history = _dialogue(messages)
    body = f"지금까지의 대화입니다.\n\n{history}\n\n참여자: {assembled}"
    raw = ask(
        prompts.build_fixed_prefix(age),
        f"{body}\n\n위 대화에 이어 인터뷰어로서 할 다음 응답만 출력하십시오.",
    )
    parser = TrailerParser()
    visible = parser.feed(raw)
    result = parser.finish()
    return (visible + result.text).strip(), result.ended, result.malicious


def _score_turn(
    messages: list[dict],
    evidence: list[dict],
    utterance: str,
    turn: int,
) -> list[dict]:
    """Tag one participant utterance through the real axis contract."""
    payload = json.dumps(
        {"transcript": messages, "evidence_log": evidence, "participant_utterance": utterance},
        ensure_ascii=False,
    )
    raw = ask(
        prompts.load_scoring_instruction(),
        f"{payload}\n\n증거 배열 하나만 JSON으로 출력하십시오. 다른 말은 쓰지 마십시오.",
    )
    match = _JSON_ARRAY.search(raw)
    if match is None:
        return []
    try:
        items = json.loads(match.group())
    except json.JSONDecodeError:
        return []
    return [{**item, "turn": turn} for item in items if isinstance(item, dict)]


def run(persona_name: str, birth_year: int) -> dict:
    """Drive one complete rehearsal interview and return its transcript record."""
    persona = (PERSONA_DIR / f"{persona_name}.md").read_text(encoding="utf-8")
    age = 2040 - birth_year
    messages: list[dict] = []
    evidence: list[dict] = []
    asked_keys: dict[str, int] = {}
    answered_keys: dict[str, int] = {}

    opening, _ended, _malicious = _interview_turn([], age, prompts.build_opening_instruction())
    messages.append({"turn": 0, "role": "assistant", "text": opening})
    print(f"[0] 인터뷰어: {opening}")

    for turn in range(1, MAX_TURNS + 1):
        reply = ask(persona, f"인터뷰어: {messages[-1]['text']}\n\n참여자로서 답변만 출력하십시오.")
        print(f"[{turn}] 참여자: {reply}")

        outstanding = next(reversed(asked_keys), None)
        if outstanding is not None and outstanding not in answered_keys and not is_refusal(reply):
            answered_keys[outstanding] = turn

        assembled, question = prompts.append_operational_instruction(
            reply,
            evidence,
            turn,
            WRAPUP_TURN,
            asked_keys,
            answered_keys,
        )
        text, ended, _malicious = _interview_turn(messages, age, assembled)
        evidence.extend(_score_turn(messages, evidence, reply, turn))
        messages.append({"turn": turn, "role": "user", "text": reply})
        messages.append({"turn": turn, "role": "assistant", "text": text})
        if question is not None:
            asked_keys[question.answer_key] = turn
        print(f"[{turn}] 인터뷰어: {text}")

        allowed = prompts.termination_allowed(turn, WRAPUP_TURN, answered_keys)
        if ended and not allowed:
            print(f"    (무자격 종료 차단: turn {turn})")
        if ended and allowed:
            break

    result = scoring.score_type(evidence, f"rehearsal-{persona_name}")
    return {
        "name": persona_name,
        "messages": messages,
        "evidence": evidence,
        "asked_keys": asked_keys,
        "answered_keys": answered_keys,
        "type_result": result,
        "bank_size": len(bank.QUESTIONS),
    }


def main() -> None:
    """Rehearse one persona and append it to the rehearsal record."""
    record = run(sys.argv[1], int(sys.argv[2]))
    existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")) if OUTPUT_PATH.is_file() else []
    existing = [item for item in existing if item["name"] != record["name"]]
    existing.append(record)
    OUTPUT_PATH.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\n턴 {max(m['turn'] for m in record['messages'])} · 증거 {len(record['evidence'])}건")
    print(f"판정 {record['type_result']['code']} -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
