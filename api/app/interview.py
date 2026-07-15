import json
from collections.abc import AsyncIterator

from google.genai import types

from app import gemini, knowledge, prompts, session
from app.config import get_settings
from app.logging import log_event
from app.trailer import TrailerParser, TrailerResult


async def start(current: session.Session) -> AsyncIterator[str]:
    """Stream and store the opening greeting for one session."""
    async for event in _run(current, 0, None):
        yield event


async def reply(current: session.Session, user_text: str) -> AsyncIterator[str]:
    """Stream and store one assistant response to a participant utterance."""
    async for event in _run(current, session.next_turn(current), user_text):
        yield event


async def _run(
    current: session.Session,
    turn: int,
    user_text: str | None,
) -> AsyncIterator[str]:
    """Execute one Gemini turn and emit participant-safe SSE events."""
    settings = get_settings()
    contents = _build_contents(current, user_text, turn)
    tool = knowledge.file_search_tool()
    config = types.GenerateContentConfig(
        system_instruction=prompts.build_fixed_prefix(current["age_2040"]),
        tools=[tool] if tool is not None else None,
    )
    stream = await gemini.get_client().aio.models.generate_content_stream(
        model=settings.gemini_model,
        contents=contents,
        config=config,
    )
    parser = TrailerParser()
    visible_parts: list[str] = []
    token_usage: dict[str, int] | None = None

    async for chunk in stream:
        if chunk.usage_metadata is not None:
            token_usage = gemini.token_usage(chunk.usage_metadata)
        if chunk.text:
            safe_text = parser.feed(chunk.text)
            if safe_text:
                visible_parts.append(safe_text)
                yield _sse("delta", {"text": safe_text})

    result = parser.finish(turn)
    if result.text:
        visible_parts.append(result.text)
        yield _sse("delta", {"text": result.text})
    assistant_text = "".join(visible_parts)

    if result.aborted:
        log_event(
            "aborted",
            session_id=current["session_id"],
            token_usage=token_usage,
            turn=turn,
        )
        session.discard_session(current["session_id"])
        yield _sse("end", {"state": "aborted"})
        return

    _save_turn(current, turn, user_text, assistant_text, result)
    _log_issues(current["session_id"], turn, result.issues)
    if result.ended:
        current["status"] = "ended"
        log_event(
            "ended",
            session_id=current["session_id"],
            token_usage=token_usage,
            turn=turn,
        )
        state = "ended"
    else:
        log_event(
            "turn_progress",
            session_id=current["session_id"],
            token_usage=token_usage,
            turn=turn,
        )
        state = "continue"
    yield _sse("end", {"state": state})


def _build_contents(
    current: session.Session,
    user_text: str | None,
    turn: int,
) -> list[types.Content]:
    """Build full conversation contents with the current utterance last."""
    contents = [
        _content("user" if message["role"] == "user" else "model", message["text"])
        for message in current["messages"]
    ]
    if user_text is None:
        # Gemini requires contents even without participant input, so the opening uses
        # backend guidance to preserve that distinction.
        contents.append(_content("user", prompts.build_opening_instruction()))
        return contents

    settings = get_settings()
    assembled = prompts.append_operational_instruction(
        user_text,
        current["evidence_log"],
        turn,
        settings.interview_wrapup_turn,
        settings.interview_target_turns,
        settings.axis_min_evidence,
    )
    contents.append(_content("user", assembled))
    return contents


def _content(role: str, text: str) -> types.Content:
    """Build one text-only Gemini conversation content item."""
    return types.Content(role=role, parts=[types.Part.from_text(text=text)])


def _save_turn(
    current: session.Session,
    turn: int,
    user_text: str | None,
    assistant_text: str,
    result: TrailerResult,
) -> None:
    """Persist one completed stream into the in-memory session."""
    if user_text is None:
        session.save_greeting(current, assistant_text)
    else:
        session.save_turn(current, turn, user_text, assistant_text)
        current["evidence_log"].extend(result.evidence)


def _log_issues(session_id: str, turn: int, issues: list[str]) -> None:
    """Log trailer failures without including participant content."""
    for issue in issues:
        event = (
            "evidence_item_invalid"
            if issue.startswith("evidence_item_invalid")
            else "evidence_trailer_invalid"
        )
        log_event(event, session_id=session_id, turn=turn, reason=issue)


def _sse(event: str, data: dict[str, str]) -> str:
    """Encode one named server-sent event."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"
