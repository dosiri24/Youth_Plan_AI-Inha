from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app import interview, report, scoring, session
from app.config import get_settings
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


class SentencePosition(BaseModel):
    """Prevent revision feedback from targeting an ambiguous sentence."""

    model_config = ConfigDict(extra="forbid", strict=True)

    axis: Literal["EI", "SN", "TF", "JP"]
    demand_id: Annotated[str, Field(min_length=1)]
    sentence_index: Annotated[int, Field(ge=0)]


class ReviseRequest(BaseModel):
    """Require at least one concrete objection for demand regeneration."""

    model_config = ConfigDict(extra="forbid", strict=True)

    selected_sentences: Annotated[list[SentencePosition], Field(min_length=1)]
    comment: Annotated[str, Field(min_length=1)]


class SubmissionResponse(BaseModel):
    """Keep submitted report data out of the one-shot response."""

    submission_id: str


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

if get_settings().dev_mode:
    from app.dev import router as dev_router

    app.include_router(dev_router)


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


@app.post("/api/sessions/{session_id}/result")
async def generate_result(session_id: str) -> dict[str, object]:
    """Keep deterministic scoring independent from report-track latency."""
    current = _find_session(session_id)
    if current["status"] != "ended":
        raise HTTPException(status.HTTP_409_CONFLICT)

    type_result = scoring.score_type(current["evidence_log"], session_id)
    draft = await report.generate_draft(current, type_result)
    personal_report = report.assemble(current, type_result, draft)
    current["type_result"] = type_result
    current["report"] = personal_report
    current["status"] = "result_ready"
    log_event(
        "result_generated",
        session_id=session_id,
        token_usage=draft.token_usage,
    )
    return {
        "type_result": report.slim_type_result(type_result),
        "report": report.slim_report(personal_report),
    }


@app.post("/api/sessions/{session_id}/result/revise")
async def revise_result(
    session_id: str,
    request: ReviseRequest,
) -> dict[str, object]:
    """Keep revision effects confined to a full demand-axis replacement."""
    current = _find_session(session_id)
    if current["status"] != "result_ready" or current["report"] is None:
        raise HTTPException(status.HTTP_409_CONFLICT)

    selections = [item.model_dump() for item in request.selected_sentences]
    revised, token_usage = await report.revise(current, selections, request.comment)
    current["report"] = revised
    current["revision_count"] += 1
    log_event(
        "revised",
        session_id=session_id,
        token_usage=token_usage,
        revision_count=current["revision_count"],
    )
    return report.slim_report(revised)


@app.post("/api/sessions/{session_id}/submit", response_model=SubmissionResponse)
def submit_result(session_id: str) -> SubmissionResponse:
    """Leave a single persistence insertion point before memory is discarded."""
    current = _find_session(session_id)
    if (
        current["status"] != "result_ready"
        or current["type_result"] is None
        or current["report"] is None
    ):
        raise HTTPException(status.HTTP_409_CONFLICT)

    submission_id = str(uuid4())
    # Phase 4 persistence must save without a status change, then discard only after success.
    session.discard_session(session_id)
    log_event("submitted", session_id=session_id)
    return SubmissionResponse(submission_id=submission_id)


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
