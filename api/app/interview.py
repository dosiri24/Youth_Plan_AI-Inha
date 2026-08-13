import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import suppress

from google.genai import types

from app import gemini, knowledge, prompts, session, tagging
from app.axes import Evidence
from app.config import Settings, get_settings
from app.lexicon import (
    ANSWER_DEMANDS,
    STOP_MARKS,
    WH_WORDS,
)
from app.logging import log_event
from app.trailer import TrailerParser

# Fixed backend replies, so the model never counts violations or writes the closing itself.
MALICIOUS_WARNING = (
    "이런 말씀이 반복되면 대화가 자동으로 종료됩니다. 2040년 인천 이야기로 돌아가 주세요."
)
MALICIOUS_ABORT = "같은 발화가 반복되어 인터뷰를 종료합니다."
MALICIOUS_LIMIT = 2


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

        if result.malicious:
            current["malicious_count"] += 1
            aborting = current["malicious_count"] >= MALICIOUS_LIMIT
            notice = MALICIOUS_ABORT if aborting else MALICIOUS_WARNING
            yield _sse("delta", {"text": notice})
            if scoring_task is not None:
                await _cancel_scoring(scoring_task, current["session_id"], turn)
            log_event(
                "malicious",
                session_id=current["session_id"],
                token_usage=token_usage,
                turn=turn,
                count=current["malicious_count"],
            )
            if aborting:
                session.discard_session(current["session_id"])
                yield _sse("end", {"state": "aborted", "progress": 0})
                return
            yield _sse(
                "end",
                {"state": "continue", "progress": _progress(turn, "continue", settings)},
            )
            return

        evidence = (
            await _collect_scoring(scoring_task, current["session_id"], turn)
            if scoring_task is not None
            else []
        )
        _save_turn(current, turn, user_text, assistant_text, evidence)

        ended = result.ended and _may_end(turn, user_text, assistant_text, settings)
        if result.ended and not ended:
            log_event("termination_withheld", session_id=current["session_id"], turn=turn)
        if ended:
            current["status"] = "ended"
        log_event(
            "ended" if ended else "turn_progress",
            session_id=current["session_id"],
            token_usage=token_usage,
            turn=turn,
            **_question_shape(assistant_text),
        )
        state = "ended" if ended else "continue"
        yield _sse("end", {"state": state, "progress": _progress(turn, state, settings)})
    finally:
        if scoring_task is not None and not scoring_task.done():
            scoring_task.cancel()


def _build_contents(
    current: session.Session,
    user_text: str | None,
    turn: int,
) -> list[types.Content]:
    """Build full conversation contents with the current utterance and its instruction last."""
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
        turn,
        settings.interview_wrapup_turn,
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
        return
    session.save_turn(current, turn, user_text, assistant_text)
    current["evidence_log"].extend(evidence)


def _may_end(
    turn: int,
    user_text: str | None,
    assistant_text: str,
    settings: Settings,
) -> bool:
    """Decide whether this session has earned the right to close on this turn."""
    if user_text is not None and _matches(user_text, STOP_MARKS):
        return True
    return turn >= settings.interview_wrapup_turn and not _matches(assistant_text, ANSWER_DEMANDS)


def _matches(text: str, marks: tuple[str, ...]) -> bool:
    """Report whether any listed surface form appears in one utterance."""
    return any(mark in text for mark in marks)


def _question_shape(assistant_text: str) -> dict[str, int | bool]:
    """Record the two surface counts that flag a turn as a candidate double question.

    These are candidates, not verdicts: only a human reading the turn can settle whether
    two independent answer slots were opened.
    """
    return {
        "question_marks": assistant_text.count("?"),
        "wh_words": sum(word in assistant_text for word in WH_WORDS),
        # The interviewer addresses the participant directly, so this word is always a leak.
        "meta_leak": "참여자" in assistant_text,
    }


def _progress(turn: int, state: str, settings: Settings) -> int:
    """Calculate the participant progress percentage from the backend's turn plan."""
    if state == "aborted" or turn == 0:
        return 0
    if state == "ended":
        return 100
    return int(min(turn / settings.interview_target_turns, 1) * 100)


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
