"""Regenerate developer-mode fixtures by running simulated participants through the real engine.

Run from the api directory: `PYTHONPATH=. uv run python scripts/regen_fixtures.py [name ...]`.
Each persona in scripts/personas.json completes one real Gemini interview, and the resulting
transcript, evidence log, and submission document are written as the PLAN 6.4 fixtures.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from google.genai import types

from app import gemini, interview, report, scoring, session
from app.config import get_settings
from app.logging import configure_logging

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"
# Personas live beside the generator, not in fixtures/, which the dev picker enumerates.
PERSONA_PATH = Path(__file__).resolve().parent / "personas.json"
MAX_TURNS = 20


def load_personas() -> tuple[str, dict]:
    """Load the shared answering rules and every simulated participant."""
    payload = json.loads(PERSONA_PATH.read_text(encoding="utf-8"))
    return payload["rules"], payload["personas"]


async def drain(events) -> None:
    """Consume the SSE generator so the engine stores the completed turn."""
    async for _ in events:
        pass


async def answer(rules: str, persona: str, messages: list[dict]) -> str:
    """Ask Gemini for the simulated participant's next reply."""
    contents = [
        types.Content(
            role="user" if message["role"] == "assistant" else "model",
            parts=[types.Part.from_text(text=message["text"])],
        )
        for message in messages
    ]
    response = await gemini.get_client().aio.models.generate_content(
        model=get_settings().gemini_model,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=rules + persona),
    )
    return response.text.strip()


def isoformat_messages(messages: list[dict]) -> list[dict]:
    """Render runtime timestamps into the stored fixture shape."""
    return [{**message, "timestamp": message["timestamp"].isoformat()} for message in messages]


def write(path: Path, document: dict) -> None:
    """Write one fixture document as indented UTF-8 JSON."""
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def run_interview(name: str, rules: str, spec: dict, out_dir: Path) -> dict:
    """Complete one simulated interview and write its transcript fixture."""
    current = session.create_session(spec["birth_year"])
    await drain(interview.start(current))

    for turn in range(1, MAX_TURNS + 1):
        if current["status"] != "active":
            break
        reply = await answer(rules, spec["persona"], current["messages"])
        await drain(interview.reply(current, reply))
        print(
            f"[{name}] turn {turn} · evidence {len(current['evidence_log'])}"
            f" · status {current['status']}",
            file=sys.stderr,
        )

    write(
        out_dir / f"{name}.json",
        {
            "name": name,
            "label": spec["label"],
            "birth_year": spec["birth_year"],
            "messages": isoformat_messages(current["messages"]),
            "evidence_log": current["evidence_log"],
        },
    )
    return current


async def run_submission(name: str, current: dict, out_dir: Path) -> None:
    """Push one completed session through result generation into a submission fixture."""
    current["status"] = "ended"
    type_result = scoring.score_type(current["evidence_log"], current["session_id"])
    draft = await report.generate_draft(current, type_result)
    personal_report = report.assemble(current, type_result, draft)
    created_at = personal_report["meta"]["created_at"].isoformat()
    write(
        out_dir / f"{name}.json",
        {
            "session_id": current["session_id"],
            "submitted_at": datetime.now(UTC).isoformat(),
            "self_info": personal_report["self_info"],
            "raw_transcript": isoformat_messages(current["messages"]),
            "evidence_log": current["evidence_log"],
            "type_result": type_result,
            "report": {
                **personal_report,
                "meta": {**personal_report["meta"], "created_at": created_at},
            },
            "deidentified": None,
            "submission_id": str(uuid4()),
        },
    )
    for axis in type_result["axes"]:
        print(
            f"[{name}] {axis['axis']} {axis['letter']} {axis['strength']}% {axis['scores']}",
            file=sys.stderr,
        )
    print(f"[{name}] DONE code={type_result['code']}", file=sys.stderr)


async def main() -> None:
    """Regenerate every requested fixture end to end."""
    rules, personas = load_personas()
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*", default=list(personas))
    parser.add_argument("--fixtures", default=str(FIXTURE_DIR))
    parser.add_argument("--submissions", default=str(FIXTURE_DIR / "submissions"))
    args = parser.parse_args()

    configure_logging()
    for name in args.names or list(personas):
        current = await run_interview(name, rules, personas[name], Path(args.fixtures))
        await run_submission(name, current, Path(args.submissions))


if __name__ == "__main__":
    asyncio.run(main())
