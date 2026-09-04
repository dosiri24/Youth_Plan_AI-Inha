"""Draw prize winners from the entry collection.

Run from the api directory:
`PYTHONPATH=. uv run python scripts/draw_prize.py RESULT_PATH [--count 10]`.
"""

import argparse
import json
import random
import sys
from datetime import UTC, datetime
from pathlib import Path

from app import firestore


def main() -> None:
    """Record every entrant alongside the randomly drawn winners."""
    parser = argparse.ArgumentParser()
    parser.add_argument("result_path", type=Path)
    parser.add_argument("--count", type=int, default=10)
    args = parser.parse_args()

    if args.result_path.exists():
        raise SystemExit(f"result path already exists: {args.result_path}")

    client = firestore.get_client()
    entries = []
    for document in client.collection("prize_entries").stream():
        body = document.to_dict()
        entries.append({"phone": body["phone"], "entered_at": body["entered_at"].isoformat()})
    entries.sort(key=lambda entry: entry["entered_at"])
    print(f"Read {len(entries)} prize entries.", file=sys.stderr)

    winners = random.SystemRandom().sample(entries, min(args.count, len(entries)))

    with args.result_path.open("x", encoding="utf-8") as result_file:
        json.dump(
            {
                "drawn_at": datetime.now(UTC).isoformat(),
                "requested_count": args.count,
                "entries": entries,
                "winners": winners,
            },
            result_file,
            ensure_ascii=False,
            indent=2,
        )
        result_file.write("\n")

    for index, winner in enumerate(winners, start=1):
        print(f"{index}. {winner['phone']}")
    print(f"Result written to {args.result_path}.", file=sys.stderr)


if __name__ == "__main__":
    main()
