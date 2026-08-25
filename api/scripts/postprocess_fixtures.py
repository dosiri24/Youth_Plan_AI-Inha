"""Rerun submission post-processing on example submissions with the current prompts.

Run from the api directory with the project id cleared so the stage writes stay in memory:
`GCP_PROJECT_ID= PYTHONPATH=. uv run python scripts/postprocess_fixtures.py [name ...]`.
Each refreshed fixture spends real Gemini credits for its extra-demand, sector, and blinding calls.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from app import analysis
from app.logging import configure_logging

SUBMISSION_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "submissions"


async def rebuild(name: str) -> None:
    """Rerun every post-submission call for one stored example submission."""
    path = SUBMISSION_DIR / f"{name}.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["extra_demands"] = None
    document["sectors"] = None
    document["deidentified"] = None

    await analysis.postprocess_submission(document)

    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    extra = document["extra_demands"]
    labels = document["sectors"]
    print(
        f"[{name}] extra={len(extra) if extra is not None else 'FAILED'}"
        f" sectors={len(labels) if labels is not None else 'FAILED'}"
        f" deidentified={'FAILED' if document['deidentified'] is None else 'ok'}",
        file=sys.stderr,
    )


async def main() -> None:
    """Post-process every requested example submission concurrently."""
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    args = parser.parse_args()

    configure_logging()
    names = args.names or sorted(path.stem for path in SUBMISSION_DIR.glob("*.json"))
    await asyncio.gather(*(rebuild(name) for name in names))


if __name__ == "__main__":
    asyncio.run(main())
