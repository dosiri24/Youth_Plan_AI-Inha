"""Relabel stored submissions with the current sector prompt.

Run from the api directory:
`PYTHONPATH=. uv run python scripts/relabel_submissions.py [submission_id ...]` or
`PYTHONPATH=. uv run python scripts/relabel_submissions.py --all`.
Each relabelled submission spends one real Gemini call.

Only the sector labels and their keywords are rebuilt. The report, the extra demands,
and the de-identified copy are left alone, so the labels land on the same demands the
participant already saw. Keywords skip de-identification by contract, which is why
this call can be repeated on its own.
"""

import argparse
import asyncio
import sys

from app import analysis, store
from app.logging import configure_logging


def keywords(labels: dict[str, dict[str, object]]) -> list[tuple[str, str]]:
    """List every labelled demand and its keywords in stored order."""
    return [
        (demand_id, " ".join(label["keywords"]) or "(없음)") for demand_id, label in labels.items()
    ]


async def relabel(submission_id: str, submission_store: store.SubmissionStore) -> None:
    """Rebuild one stored submission's sector labels and report what changed."""
    document = submission_store.get(submission_id)
    if document is None:
        raise ValueError(f"submission not found: {submission_id}")

    document["submission_id"] = submission_id
    before = keywords(document.get("sectors") or {})
    nickname = document["self_info"]["nickname"]

    await analysis.label_sectors(document)

    print(f"[{submission_id}] {nickname}", file=sys.stderr)
    for demand_id, words in before:
        print(f"[{submission_id}] before {demand_id}: {words}", file=sys.stderr)
    for demand_id, words in keywords(document.get("sectors") or {}):
        print(f"[{submission_id}] after {demand_id}: {words}", file=sys.stderr)


async def main() -> None:
    """Relabel every selected stored submission concurrently."""
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
        *(relabel(submission_id, submission_store) for submission_id in submission_ids)
    )


if __name__ == "__main__":
    asyncio.run(main())
