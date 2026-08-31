"""Rebuild example submissions with stored evidence and the current structuring prompt.

Run from the api directory: `PYTHONPATH=. uv run python scripts/restructure_fixtures.py [name ...]`.
Each refreshed fixture spends one real Gemini credit for its structuring call.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app import report, scoring, session
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


async def rebuild(name: str) -> None:
    """Rebuild one example submission from its fixture's stored evidence log."""
    fixture_path = FIXTURE_DIR / f"{name}.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    messages = revive(fixture["messages"])
    evidence = fixture["evidence_log"]

    submission_path = SUBMISSION_DIR / f"{name}.json"
    if not submission_path.is_file():
        print(f"[{name}] no example submission to refresh", file=sys.stderr)
        return

    submission = json.loads(submission_path.read_text(encoding="utf-8"))
    current: session.Session = {
        "session_id": submission["session_id"],
        "birth_year": fixture["birth_year"],
        "age_2045": 2045 - fixture["birth_year"],
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
            # These three describe the demand list this call just replaced, so a stale
            # one would label, blind, or dedupe against demands that no longer exist.
            "extra_demands": None,
            "sectors": None,
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
    """Restructure every requested fixture concurrently."""
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    args = parser.parse_args()

    configure_logging()
    names = args.names or sorted(path.stem for path in FIXTURE_DIR.glob("*.json"))
    await asyncio.gather(*(rebuild(name) for name in names))


if __name__ == "__main__":
    asyncio.run(main())
