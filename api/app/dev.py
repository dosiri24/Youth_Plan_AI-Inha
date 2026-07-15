import json
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app import session
from app.logging import log_event

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"
router = APIRouter(prefix="/api/dev")


class FixtureInfo(BaseModel):
    """Represent fixture metadata shown in the developer picker."""

    name: str
    label: str


class LoadRequest(BaseModel):
    """Represent the fixture selected for an existing session."""

    name: str


class TranscriptMessage(BaseModel):
    """Represent one loaded transcript message in the developer response."""

    turn: int
    role: Literal["user", "assistant"]
    text: str
    timestamp: datetime


@router.get("/fixtures", response_model=list[FixtureInfo])
def list_fixtures() -> list[FixtureInfo]:
    """Return only the metadata needed by the developer picker."""
    return [
        FixtureInfo(name=data["name"], label=data["label"])
        for path in sorted(FIXTURE_DIR.glob("*.json"))
        for data in [json.loads(path.read_text())]
    ]


@router.post(
    "/sessions/{session_id}/load",
    response_model=list[TranscriptMessage],
)
def load_fixture(session_id: str, request: LoadRequest) -> list[TranscriptMessage]:
    """Replace one active session's conversation with a genuine fixture."""
    current = session.find_session(session_id)
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if current["status"] != "active":
        raise HTTPException(status.HTTP_409_CONFLICT)

    path = FIXTURE_DIR / f"{request.name}.json"
    if not path.is_file() or path.stem != request.name:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    data = json.loads(path.read_text())
    current["messages"] = [
        _message(
            message["turn"],
            message["role"],
            message["text"],
            message["timestamp"],
        )
        for message in data["messages"]
    ]
    current["evidence_log"] = [
        {
            "axis": evidence["axis"],
            "pole": evidence["pole"],
            "weight": evidence["weight"],
            "text": evidence["text"],
            "turn": evidence["turn"],
        }
        for evidence in data["evidence_log"]
    ]
    current["status"] = "ended"
    log_event(
        "dev_fixture_loaded",
        session_id=current["session_id"],
        fixture=request.name,
    )
    return [TranscriptMessage.model_validate(message) for message in current["messages"]]


def _message(
    turn: int,
    role: Literal["user", "assistant"],
    text: str,
    timestamp: str,
) -> session.Message:
    """Revive fixture timestamps into the runtime transcript shape."""
    return {
        "turn": turn,
        "role": role,
        "text": text,
        "timestamp": datetime.fromisoformat(timestamp),
    }
