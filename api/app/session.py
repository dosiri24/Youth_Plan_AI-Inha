from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal, TypedDict
from uuid import uuid4

if TYPE_CHECKING:
    from app.report import PersonalReport
    from app.scoring import TypeResult


class Message(TypedDict):
    """Define one raw transcript message."""

    turn: int
    role: Literal["user", "assistant"]
    text: str
    timestamp: datetime


class Evidence(TypedDict):
    """Define one validated evidence record."""

    axis: str
    pole: str
    weight: int
    text: str
    turn: int


class Session(TypedDict):
    """Define the current in-memory session shape."""

    session_id: str
    birth_year: int
    age_2040: int
    messages: list[Message]
    evidence_log: list[Evidence]
    status: Literal["active", "ended", "result_ready", "submitted"]
    type_result: TypeResult | None
    compressed_transcript: str | None
    report: PersonalReport | None
    revision_count: int
    created_at: datetime


sessions: dict[str, Session] = {}


def create_session(birth_year: int) -> Session:
    """Create and retain one active in-memory interview session."""
    session_id = str(uuid4())
    current: Session = {
        "session_id": session_id,
        "birth_year": birth_year,
        "age_2040": 2040 - birth_year,
        "messages": [],
        "evidence_log": [],
        "status": "active",
        "type_result": None,
        "compressed_transcript": None,
        "report": None,
        "revision_count": 0,
        "created_at": datetime.now(UTC),
    }
    sessions[session_id] = current
    return current


def find_session(session_id: str) -> Session | None:
    """Return one in-memory session when it exists."""
    return sessions.get(session_id)


def discard_session(session_id: str) -> None:
    """Discard one session without persistence."""
    sessions.pop(session_id, None)


def save_greeting(current: Session, text: str) -> None:
    """Store the opening assistant greeting as turn zero."""
    current["messages"].append(_message(0, "assistant", text))


def next_turn(current: Session) -> int:
    """Return the next user-and-assistant turn number."""
    return max((message["turn"] for message in current["messages"]), default=0) + 1


def save_turn(current: Session, turn: int, user_text: str, assistant_text: str) -> None:
    """Store one user utterance and its assistant reply under one turn."""
    current["messages"].extend(
        (
            _message(turn, "user", user_text),
            _message(turn, "assistant", assistant_text),
        )
    )


def _message(turn: int, role: Literal["user", "assistant"], text: str) -> Message:
    """Build one Firestore-compatible raw transcript message."""
    return {"turn": turn, "role": role, "text": text, "timestamp": datetime.now(UTC)}
