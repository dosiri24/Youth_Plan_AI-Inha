import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.base import RequestResponseEndpoint

from app import analysis, interview, prompts, report, scoring, session, store
from app.config import get_settings
from app.logging import configure_logging, log_event

configure_logging()

PROTECTED_PATH_PREFIXES = ("/api/dev/", "/api/admin/")
ACTIVITY_TYPES = (
    "visit_participant",
    "visit_admin",
    "interview_start",
    "result_view",
    "submission",
)
KST = ZoneInfo("Asia/Seoul")


class VisitRequest(BaseModel):
    """Represent one public page visit event."""

    page: Literal["participant", "admin"]


class CreateSessionRequest(BaseModel):
    """Represent the mock-auth session creation request."""

    birth_year: Annotated[int, Field(strict=True, ge=1900, le=2026)]
    gender: Literal["male", "female", "other"]


class CreateSessionResponse(BaseModel):
    """Represent a newly created interview session."""

    session_id: str


class MessageRequest(BaseModel):
    """Represent one participant interview utterance."""

    text: str


class SentencePosition(BaseModel):
    """Prevent revision feedback from targeting an ambiguous sentence."""

    model_config = ConfigDict(extra="forbid", strict=True)

    axis: report.AxisName
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


class DeleteSubmissionRequest(BaseModel):
    """Carry the access code that confirms permanent submission deletion."""

    access_code: str


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Log application startup with the identifiers every tuning measurement is filed under."""
    settings = get_settings()
    log_event(
        "startup",
        model=settings.gemini_model,
        interview_provider=settings.interview_provider,
        claude_model=settings.claude_model,
        prompts=prompts.prompt_fingerprint(),
    )
    yield


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def enforce_access_code(
    request: Request,
    call_next: RequestResponseEndpoint,
) -> Response:
    """Require the configured code on developer and admin route groups."""
    access_code = get_settings().access_code
    if access_code and request.url.path.startswith(PROTECTED_PATH_PREFIXES):
        submitted_code = request.headers.get("X-Access-Code", "")
        if not secrets.compare_digest(
            submitted_code.encode(),
            access_code.encode(),
        ):
            return Response(status_code=status.HTTP_403_FORBIDDEN)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().web_origin],
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


@app.post("/api/visits", status_code=status.HTTP_204_NO_CONTENT)
def record_visit(visit: VisitRequest, request: Request) -> Response:
    """Record one public participant or admin page visit."""
    _record_activity(f"visit_{visit.page}", request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/sessions", response_model=CreateSessionResponse)
def create_interview(
    session_request: CreateSessionRequest,
    request: Request,
) -> CreateSessionResponse:
    """Create one active in-memory interview session."""
    current = session.create_session(session_request.birth_year, session_request.gender)
    log_event("session_created", session_id=current["session_id"])
    _record_activity("interview_start", request)
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
    """Discard one unsubmitted interview without saving any data."""
    _find_session(session_id)
    session.discard_session(session_id)
    log_event("abandoned", session_id=session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete(
    "/api/sessions/{session_id}/turns/last",
    status_code=status.HTTP_204_NO_CONTENT,
)
def undo_last_turn(session_id: str) -> Response:
    """Remove the latest completed participant turn from an active session."""
    current = _find_session(session_id)
    turn = session.undo_last_turn(current)
    if turn is None:
        raise HTTPException(status.HTTP_409_CONFLICT)
    log_event("turn_undone", session_id=session_id, turn=turn)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/sessions/{session_id}/result")
async def generate_result(session_id: str, request: Request) -> dict[str, object]:
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
    _record_activity("result_view", request)
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
def submit_result(
    session_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
) -> SubmissionResponse:
    """Leave a single persistence insertion point before memory is discarded."""
    current = _find_session(session_id)
    if (
        current["status"] != "result_ready"
        or current["type_result"] is None
        or current["report"] is None
    ):
        raise HTTPException(status.HTTP_409_CONFLICT)

    submission_id = str(uuid4())
    # Persist the full document before discarding so a save failure leaves the session retryable.
    document = _submission_document(current)
    store.get_store().save(submission_id, document)
    background_tasks.add_task(
        analysis.deidentify,
        {**document, "submission_id": submission_id},
    )
    session.discard_session(session_id)
    log_event("submitted", session_id=session_id, submission_id=submission_id)
    _record_activity("submission", request)
    return SubmissionResponse(submission_id=submission_id)


@app.get("/api/admin/submissions")
def list_submissions() -> list[dict[str, object]]:
    """Return submission summaries ordered newest first for the admin list."""
    summaries = [_submission_summary(document) for document in store.get_store().list()]
    summaries.sort(key=lambda item: item["submitted_at"], reverse=True)
    return summaries


@app.get("/api/admin/activity")
def get_activity() -> dict[str, object]:
    """Return activity totals and newest-first event details."""
    totals = _empty_activity_counts()
    events: list[dict[str, str]] = []
    for document in store.get_activity_store().list():
        event_type = document["type"]
        totals[event_type] += 1
        agent = document.get("agent", "")
        events.append(
            {
                "ts": datetime.fromisoformat(document["ts"]).astimezone(KST).isoformat(),
                "type": event_type,
                "ip": document.get("ip", ""),
                "device": _device_label(agent),
                "browser": _browser_label(agent),
            }
        )
    events.sort(key=lambda event: event["ts"], reverse=True)

    return {"totals": totals, "events": events}


@app.get("/api/admin/submissions/{submission_id}")
def get_submission(submission_id: str) -> dict[str, object]:
    """Return one complete submission document for the admin detail."""
    document = store.get_store().get(submission_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return document


@app.delete(
    "/api/admin/submissions/{submission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_submission(
    submission_id: str,
    request: DeleteSubmissionRequest | None = None,
) -> Response:
    """Permanently delete one submission after separate body-code confirmation."""
    access_code = get_settings().access_code
    submitted_code = request.access_code if request is not None else ""
    if access_code and not secrets.compare_digest(
        submitted_code.encode(),
        access_code.encode(),
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if not store.get_store().delete(submission_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/admin/analysis/run")
async def run_analysis() -> dict[str, str]:
    """Execute one synchronous admin analysis batch."""
    try:
        run_id = await analysis.execute()
    except analysis.NoSubmissionsError:
        raise HTTPException(status.HTTP_409_CONFLICT) from None
    return {"run_id": run_id}


@app.get("/api/admin/analysis/latest")
def latest_analysis() -> store.Document:
    """Return the most recently persisted comprehensive report."""
    document = store.get_analysis_store().latest()
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return document


def _submission_document(current: session.Session) -> store.Document:
    """Build the 7.5 submissions document from a submitted session."""
    return {
        "session_id": current["session_id"],
        "submitted_at": datetime.now(UTC),
        "self_info": current["report"]["self_info"],
        "raw_transcript": current["messages"],
        "evidence_log": current["evidence_log"],
        "type_result": current["type_result"],
        "report": current["report"],
        "deidentified": None,
    }


def _record_activity(event_type: str, request: Request) -> None:
    """Keep auxiliary activity persistence failures out of primary requests."""
    try:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for is not None:
            ip = forwarded_for.split(",", 1)[0].strip()
        elif request.client:
            ip = request.client.host
        else:
            ip = ""
        store.get_activity_store().record(
            event_type,
            _mask_ip(ip),
            request.headers.get("user-agent", ""),
        )
    except Exception as exc:
        log_event("activity_record_failed", reason=type(exc).__name__)


def _mask_ip(ip: str) -> str:
    """Mask supported client IP forms before persistence."""
    if ip.count(".") == 3:
        return f"{ip.rsplit('.', 1)[0]}.*"
    if ":" in ip:
        return f"{':'.join(ip.split(':')[:4])}:*"
    return ""


def _device_label(agent: str) -> str:
    """Classify a user agent into a short device label."""
    if not agent:
        return ""
    if "iPhone" in agent:
        return "iPhone"
    if "iPad" in agent:
        return "iPad"
    if "Android" in agent:
        return "Android"
    if "Windows" in agent:
        return "Windows"
    if "Macintosh" in agent:
        return "Mac"
    return "기타"


def _browser_label(agent: str) -> str:
    """Classify a user agent into a short browser label."""
    if not agent:
        return ""
    if "SamsungBrowser" in agent:
        return "삼성인터넷"
    if "Edg" in agent:
        return "Edge"
    if "Chrome" in agent:
        return "Chrome"
    if "Firefox" in agent:
        return "Firefox"
    if "Safari" in agent:
        return "Safari"
    return "기타"


def _empty_activity_counts() -> dict[str, int]:
    """Build a zero-filled counter for every exposed activity type."""
    return dict.fromkeys(ACTIVITY_TYPES, 0)


def _submission_summary(document: store.Document) -> dict[str, object]:
    """Project one stored submission into an admin list summary."""
    personal_report = document["report"]
    return {
        "submission_id": document["submission_id"],
        "submitted_at": document["submitted_at"],
        "nickname": personal_report["self_info"]["nickname"],
        # The list shows the district it aggregates by, falling back to what was actually said.
        "region": (
            personal_report["self_info"]["normalized_region"]
            or personal_report["self_info"]["raw_region"]
        ),
        "type_code": document["type_result"]["code"],
        "turn_count": personal_report["meta"]["turn_count"],
        "revision_count": personal_report["meta"]["revision_count"],
    }


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
