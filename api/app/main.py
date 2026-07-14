from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import interview, session
from app.logging import configure_logging, log_event

configure_logging()


class CreateSessionRequest(BaseModel):
    """Represent the mock-auth session creation request."""

    birth_year: Annotated[int, Field(strict=True, ge=1900, le=2026)]


class CreateSessionResponse(BaseModel):
    """Represent a newly created interview session."""

    session_id: str


class MessageRequest(BaseModel):
    """Represent one participant interview utterance."""

    text: str


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Log application startup."""
    log_event("startup")
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Return the service health status."""
    return {"status": "ok"}


@app.post("/api/sessions", response_model=CreateSessionResponse)
def create_interview(request: CreateSessionRequest) -> CreateSessionResponse:
    """Create one active in-memory interview session."""
    current = session.create_session(request.birth_year)
    log_event("session_created", session_id=current["session_id"])
    return CreateSessionResponse(session_id=current["session_id"])


@app.post("/api/sessions/{session_id}/start")
def start_interview(session_id: str) -> StreamingResponse:
    """Stream the opening assistant greeting."""
    current = _find_session(session_id)
    if current["status"] != "active" or current["messages"]:
        raise HTTPException(status.HTTP_409_CONFLICT)
    return _stream(interview.start(current))


@app.post("/api/sessions/{session_id}/messages")
def send_message(session_id: str, request: MessageRequest) -> StreamingResponse:
    """Stream one assistant response to a participant utterance."""
    current = _find_session(session_id)
    if current["status"] != "active" or not current["messages"]:
        raise HTTPException(status.HTTP_409_CONFLICT)
    return _stream(interview.reply(current, request.text))


@app.delete("/api/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def abandon_interview(session_id: str) -> Response:
    """Discard one active interview without saving any data."""
    current = _find_session(session_id)
    if current["status"] != "active":
        raise HTTPException(status.HTTP_409_CONFLICT)
    session.discard_session(session_id)
    log_event("abandoned", session_id=session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _find_session(session_id: str) -> session.Session:
    """Return a session or raise the contracted missing-session error."""
    current = session.find_session(session_id)
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return current


def _stream(events: AsyncIterator[str]) -> StreamingResponse:
    """Return an unbuffered SSE response for interview events."""
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
