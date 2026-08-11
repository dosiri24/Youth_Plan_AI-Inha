import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from contextlib import suppress

from google.genai import types

from app import gemini, knowledge, prompts, session, tagging
from app.axes import AXIS_NAMES, Evidence
from app.config import get_settings
from app.logging import log_event
from app.trailer import TrailerParser


def start(current: session.Session) -> AsyncIterator[str]:
    """Stream and store the opening greeting for one session."""
    return _run(current, 0, None)


def reply(current: session.Session, user_text: str) -> AsyncIterator[str]:
    """Stream and store one assistant response to a participant utterance."""
    return _run(current, session.next_turn(current), user_text)


async def _run(
    current: session.Session,
    turn: int,
    user_text: str | None,
) -> AsyncIterator[str]:
    """Execute one Gemini turn and emit participant-safe SSE events."""
    settings = get_settings()
    scoring_task = _start_scoring(current, user_text, turn)
    try:
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

        result = parser.finish()
        if result.text:
            visible_parts.append(result.text)
            yield _sse("delta", {"text": result.text})
        assistant_text = "".join(visible_parts)

        if result.aborted:
            if scoring_task is not None:
                await _cancel_scoring(scoring_task, current["session_id"], turn)
            log_event(
                "aborted",
                session_id=current["session_id"],
                token_usage=token_usage,
                turn=turn,
            )
            session.discard_session(current["session_id"])
            progress = _progress(
                current["evidence_log"],
                turn,
                "aborted",
                settings.axis_min_evidence,
                settings.interview_target_turns,
            )
            yield _sse("end", {"state": "aborted", "progress": progress})
            return

        evidence = (
            await _collect_scoring(scoring_task, current["session_id"], turn)
            if scoring_task is not None
            else []
        )
        _save_turn(current, turn, user_text, assistant_text, evidence)
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
        progress = _progress(
            current["evidence_log"],
            turn,
            state,
            settings.axis_min_evidence,
            settings.interview_target_turns,
        )
        yield _sse("end", {"state": state, "progress": progress})
    finally:
        if scoring_task is not None and not scoring_task.done():
            scoring_task.cancel()


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
    evidence: list[Evidence],
) -> None:
    """Persist one completed stream into the in-memory session."""
    if user_text is None:
        session.save_greeting(current, assistant_text)
    else:
        session.save_turn(current, turn, user_text, assistant_text)
        current["evidence_log"].extend(evidence)


def _progress(
    evidence: Sequence[Evidence],
    turn: int,
    state: str,
    axis_min_evidence: int,
    target_turns: int,
) -> int:
    """Calculate the participant progress percentage from coverage and turn ratios."""
    if state == "aborted" or turn == 0:
        return 0
    if state == "ended":
        return 100

    covered = sum(
        min(
            sum(item["axis"] == axis for item in evidence),
            axis_min_evidence,
        )
        for axis in AXIS_NAMES
    )
    coverage_ratio = covered / (len(AXIS_NAMES) * axis_min_evidence)
    turn_ratio = min(turn / target_turns, 1)
    return int(min(coverage_ratio, turn_ratio) * 100)


def _start_scoring(
    current: session.Session,
    user_text: str | None,
    turn: int,
) -> asyncio.Task[tagging.TagResult] | None:
    """Start scoring from snapshots that exclude the current turn."""
    if user_text is None:
        return None
    return asyncio.create_task(
        tagging.tag(
            list(current["messages"]),
            list(current["evidence_log"]),
            user_text,
            turn,
        )
    )


async def _collect_scoring(
    task: asyncio.Task[tagging.TagResult],
    session_id: str,
    turn: int,
) -> list[Evidence]:
    """Collect scoring without allowing its failure to interrupt the interview."""
    try:
        result = await task
    except Exception as error:
        log_event(
            "evidence_scoring_failed",
            session_id=session_id,
            turn=turn,
            reason=type(error).__name__,
        )
        return []

    log_event(
        "evidence_scored",
        session_id=session_id,
        token_usage=result.token_usage,
        turn=turn,
        evidence_count=len(result.evidence),
        issue_count=len(result.issues),
    )
    _log_issues(session_id, turn, result.issues)
    return result.evidence


async def _cancel_scoring(
    task: asyncio.Task[tagging.TagResult],
    session_id: str,
    turn: int,
) -> None:
    """Cancel and join scoring before discarding an aborted session."""
    task.cancel()
    with suppress(asyncio.CancelledError):
        await _collect_scoring(task, session_id, turn)


def _log_issues(session_id: str, turn: int, issues: list[str]) -> None:
    """Log evidence validation failures without participant content."""
    for issue in issues:
        event = (
            "evidence_item_invalid"
            if issue.startswith("evidence_item_invalid")
            else "evidence_response_invalid"
        )
        log_event(event, session_id=session_id, turn=turn, reason=issue)


def _sse(event: str, data: dict[str, str | int]) -> str:
    """Encode one named server-sent event."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"
