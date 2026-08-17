"""Re-tag stored developer-mode fixtures against the current axes.md without re-interviewing.

Run from the api directory: `PYTHONPATH=. uv run python scripts/retag_fixtures.py [name ...]`.
PLAN 6.4 invalidates a fixture's evidence whenever the axis definitions or scoring anchors
change. A full `regen_fixtures.py` run would also replace the transcript, which throws away a
genuine completed interview; this replays that same transcript through the current scoring call
so only the evidence is rebuilt, then refreshes the matching example submission.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app import report, scoring, session, tagging
from app.logging import configure_logging

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"
SUBMISSION_DIR = FIXTURE_DIR / "submissions"


def write(path: Path, document: dict) -> None:
    """Write one fixture document as indented UTF-8 JSON."""
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def revive(messages: list[dict]) -> list[session.Message]:
    """Turn stored ISO timestamps back into the runtime transcript shape."""
    return [
        {
            "turn": message["turn"],
            "role": message["role"],
            "text": message["text"],
            "timestamp": datetime.fromisoformat(message["timestamp"]),
        }
        for message in messages
    ]


async def retag(name: str, messages: list[session.Message]) -> list[dict]:
    """Replay every participant turn through the current scoring call, in order."""
    evidence: list[dict] = []
    turns = sorted({message["turn"] for message in messages if message["role"] == "user"})
    for turn in turns:
        # The live engine scores from snapshots taken before the current turn is stored.
        prior = [message for message in messages if message["turn"] < turn]
        utterance = next(
            message["text"]
            for message in messages
            if message["turn"] == turn and message["role"] == "user"
        )
        result = await tagging.tag(prior, evidence, utterance, turn)
        evidence.extend(result.evidence)
        print(
            f"[{name}] turn {turn} · +{len(result.evidence)} · total {len(evidence)}"
            f" · issues {len(result.issues)}",
            file=sys.stderr,
        )
    return evidence


async def rebuild(name: str) -> None:
    """Rebuild one fixture's evidence log and its example submission document."""
    fixture_path = FIXTURE_DIR / f"{name}.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    messages = revive(fixture["messages"])

    evidence = await retag(name, messages)
    fixture["evidence_log"] = evidence
    write(fixture_path, fixture)

    submission_path = SUBMISSION_DIR / f"{name}.json"
    if not submission_path.is_file():
        print(f"[{name}] no example submission to refresh", file=sys.stderr)
        return

    submission = json.loads(submission_path.read_text(encoding="utf-8"))
    current: session.Session = {
        "session_id": submission["session_id"],
        "birth_year": fixture["birth_year"],
        "age_2040": 2040 - fixture["birth_year"],
        # A fixture has no start screen, so its file supplies the form-owned value.
        "gender": fixture["gender"],
        "messages": messages,
        "evidence_log": evidence,
        "malicious_count": 0,
        "status": "ended",
        "type_result": None,
        "report": None,
        "revision_count": 0,
        "created_at": datetime.now(UTC),
    }
    type_result = scoring.score_type(evidence, current["session_id"])
    draft = await report.generate_draft(current, type_result)
    personal_report = report.assemble(current, type_result, draft)
    submission.update(
        {
            "submitted_at": datetime.now(UTC).isoformat(),
            "self_info": personal_report["self_info"],
            "raw_transcript": fixture["messages"],
            "evidence_log": evidence,
            "type_result": type_result,
            "report": {
                **personal_report,
                "meta": {
                    **personal_report["meta"],
                    "created_at": personal_report["meta"]["created_at"].isoformat(),
                },
            },
            # A stale blinded copy would describe demands that no longer exist.
            "deidentified": None,
        }
    )
    write(submission_path, submission)
    for axis in type_result["axes"]:
        print(
            f"[{name}] {axis['axis']} {axis['letter']} {axis['strength']}%"
            f" {axis['scores']} empty={axis['empty_axis']}",
            file=sys.stderr,
        )
    print(f"[{name}] DONE code={type_result['code']}", file=sys.stderr)


async def main() -> None:
    """Re-tag every requested fixture concurrently."""
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    args = parser.parse_args()

    configure_logging()
    names = args.names or sorted(path.stem for path in FIXTURE_DIR.glob("*.json"))
    await asyncio.gather(*(rebuild(name) for name in names))


if __name__ == "__main__":
    asyncio.run(main())
