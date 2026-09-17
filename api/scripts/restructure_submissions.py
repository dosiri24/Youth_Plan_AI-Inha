"""Rebuild stored submissions with the current structuring prompt.

Run from the api directory:
`PYTHONPATH=. uv run python scripts/restructure_submissions.py [submission_id ...]` or
`PYTHONPATH=. uv run python scripts/restructure_submissions.py --all`.
Each refreshed submission spends one real Gemini call.
"""

import argparse
import asyncio
import sys
from datetime import UTC, datetime

from app import report, session, store
from app.logging import configure_logging


def revive(messages: list[dict]) -> list[session.Message]:
    """Turn stored transcript timestamps back into the runtime shape."""
    return [
        {
            "turn": message["turn"],
            "role": message["role"],
            "text": message["text"],
            # Firestore hands back datetimes; a JSON-sourced document holds ISO strings.
            "timestamp": (
                message["timestamp"]
                if isinstance(message["timestamp"], datetime)
                else datetime.fromisoformat(message["timestamp"])
            ),
        }
        for message in messages
    ]


def titles(personal_report: report.PersonalReport) -> list[tuple[str, str]]:
    """List every axis and top-demand title in display order."""
    items = [
        (demand["id"], demand["title"])
        for axis in personal_report["axis_demands"]
        for demand in axis["demands"]
    ]
    # Submissions stored before the closing question existed carry no chosen demand.
    top_title = personal_report.get("top_demand", {}).get("title", "")
    if top_title:
        items.append(("top_demand", top_title))
    return items


async def rebuild(submission_id: str, submission_store: store.SubmissionStore) -> None:
    """Rebuild one stored submission without changing its deterministic type result."""
    document = submission_store.get(submission_id)
    if document is None:
        raise ValueError(f"submission not found: {submission_id}")

    self_info = document["self_info"]
    birth_year = self_info["birth_year"]
    current: session.Session = {
        "session_id": document["session_id"],
        "birth_year": birth_year,
        "age_2045": 2045 - birth_year,
        "gender": self_info["gender"],
        "messages": revive(document["raw_transcript"]),
        "evidence_log": document["evidence_log"],
        "axis_hints": {},
        "closing_hint_sent": False,
        "malicious_count": 0,
        "status": "ended",
        "type_result": None,
        "report": None,
        "revision_count": 0,
        "created_at": datetime.now(UTC),
    }
    type_result = document["type_result"]
    before = titles(document["report"])
    nickname = self_info["nickname"]

    draft = await report.generate_draft(current, type_result)
    personal_report = report.assemble(current, type_result, draft)
    document.update(
        {
            "self_info": personal_report["self_info"],
            "report": {
                **personal_report,
                "meta": {
                    **personal_report["meta"],
                    "created_at": personal_report["meta"]["created_at"].isoformat(),
                },
            },
            "extra_demands": None,
            "sectors": None,
            "deidentified": None,
        }
    )
    submission_store.save(submission_id, document)

    print(f"[{submission_id}] {nickname}", file=sys.stderr)
    for demand_id, title in before:
        print(f"[{submission_id}] before {demand_id}: {title}", file=sys.stderr)
    for demand_id, title in titles(personal_report):
        print(f"[{submission_id}] after {demand_id}: {title}", file=sys.stderr)


async def main() -> None:
    """Restructure every selected stored submission concurrently."""
    parser = argparse.ArgumentParser()
    parser.add_argument("submission_ids", nargs="*")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    if not args.submission_ids and not args.all:
        parser.error("provide submission ids or --all")
    if args.submission_ids and args.all:
        parser.error("submission ids cannot be combined with --all")

    configure_logging()
    submission_store = store.get_store()
    submission_ids = (
        sorted(document["submission_id"] for document in submission_store.list())
        if args.all
        else args.submission_ids
    )
    await asyncio.gather(
        *(rebuild(submission_id, submission_store) for submission_id in submission_ids)
    )


if __name__ == "__main__":
    asyncio.run(main())
