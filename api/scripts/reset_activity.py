"""Back up and delete activity documents.

Run from the api directory:
`PYTHONPATH=. uv run python scripts/reset_activity.py BACKUP_PATH`.
"""

import argparse
import json
import sys
from pathlib import Path

from app import firestore


def main() -> None:
    """Back up every activity document before deleting it in batches."""
    parser = argparse.ArgumentParser()
    parser.add_argument("backup_path", type=Path)
    args = parser.parse_args()

    if args.backup_path.exists():
        raise SystemExit(f"backup path already exists: {args.backup_path}")

    client = firestore.get_client()
    documents = list(client.collection("activity").stream())
    records = [{"id": document.id, **document.to_dict()} for document in documents]

    with args.backup_path.open("x", encoding="utf-8") as backup_file:
        json.dump(records, backup_file, ensure_ascii=False, indent=2)
        backup_file.write("\n")

    print(f"Read {len(documents)} activity documents.", file=sys.stderr)
    print(f"Backup written to {args.backup_path}.", file=sys.stderr)

    deleted = 0
    for start in range(0, len(documents), 500):
        batch_documents = documents[start : start + 500]
        batch = client.batch()
        for document in batch_documents:
            batch.delete(document.reference)
        batch.commit()
        deleted += len(batch_documents)

    if deleted:
        print(f"Deleted {deleted} activity documents.", file=sys.stderr)
    else:
        print("Deleted 0 activity documents; nothing to delete.", file=sys.stderr)


if __name__ == "__main__":
    main()
