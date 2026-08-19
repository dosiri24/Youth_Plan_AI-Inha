import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import suppress

from google.genai import types

from app import claude, gemini, knowledge, prompts, session, tagging
from app.axes import AXIS_NAMES, Evidence
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
NON_RESIDENT_NOTICE = (
    "아쉽지만 이 인터뷰는 인천에 살고 계신 분들을 대상으로 하고 있어요. "
    "관심 가져 주셔서 감사합니다."
)


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
    """Execute one interview turn and emit participant-safe SSE events."""
    settings = get_settings()
    mode, hint_topic, retry, future = (
        _pacing(current, turn, settings)
        if user_text is not None
        else ("continue", None, False, False)
    )
    scoring_task = _start_scoring(current, user_text, turn)
    try:
        parser = TrailerParser()
        visible_parts: list[str] = []
        token_usage: dict[str, int] | None = None

        async for text, current_usage in _text_stream(
            current,
            user_text,
            settings,
            mode,
            hint_topic,
            retry,
            future,
        ):
            if current_usage is not None:
                token_usage = current_usage
            if text:
                safe_text = parser.feed(text)
                if safe_text:
                    visible_parts.append(safe_text)
                    yield _sse("delta", {"text": safe_text})

        result = parser.finish()
        if result.text:
            visible_parts.append(result.text)
            yield _sse("delta", {"text": result.text})
        assistant_text = "".join(visible_parts)

        if result.non_resident:
            yield _sse("delta", {"text": NON_RESIDENT_NOTICE})
            if scoring_task is not None:
                await _cancel_scoring(scoring_task, current["session_id"], turn)
            log_event(
                "non_resident",
                session_id=current["session_id"],
                token_usage=token_usage,
                turn=turn,
            )
            session.discard_session(current["session_id"])
            yield _sse("end", {"state": "aborted", "progress": 0})
            return

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

        ended = result.ended and _may_end(mode, user_text, assistant_text)
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
    # Participant-initiated stops (CancelledError, GeneratorExit) subclass BaseException,
    # so they deliberately bypass failure logging.
    except Exception as error:
        log_event(
            "turn_failed",
            session_id=current["session_id"],
            turn=turn,
            reason=type(error).__name__,
        )
        raise
    finally:
        if scoring_task is not None and not scoring_task.done():
            scoring_task.cancel()


def _pacing(
    current: session.Session,
    turn: int,
    settings: Settings,
) -> tuple[prompts.PacingMode, str | None, bool, bool]:
    """Choose one pacing mode and any uncovered-axis guidance for this turn."""
    covered = {item["axis"] for item in current["evidence_log"]}
    uncovered = [axis for axis in AXIS_NAMES if axis not in covered]
    extension_limit = settings.interview_wrapup_turn + settings.interview_max_extra_turns
    if turn < settings.interview_wrapup_turn:
        mode: prompts.PacingMode = "continue"
    elif uncovered and turn < extension_limit:
        mode = "extend"
    else:
        mode = "closing"
    future = mode == "continue" and turn == settings.interview_future_turn
    if future:
        log_event("future_transition", session_id=current["session_id"], turn=turn)

    if mode == "closing":
        if not uncovered:
            return mode, None, False, future
        axis = uncovered[0]
        log_event(
            "axis_hint",
            session_id=current["session_id"],
            turn=turn,
            axis=axis,
            closing=True,
            mode=mode,
        )
        return mode, prompts.AXIS_HINT_TOPICS[axis], False, future

    if mode == "continue" and turn < settings.interview_hint_turn:
        return mode, None, False, future

    axis_order = {axis: index for index, axis in enumerate(AXIS_NAMES)}
    ordered = sorted(
        uncovered,
        key=lambda axis: (len(current["axis_hints"].get(axis, [])), axis_order[axis]),
    )
    eligible = []
    for axis in ordered:
        attempts = current["axis_hints"].get(axis, [])
        if mode == "continue" and len(attempts) >= 2:
            continue
        # Tagging sees the prompted answer next turn, so wait before retrying.
        if attempts and attempts[-1] > turn - 2:
            continue
        eligible.append(axis)

    if mode == "extend":
        deferred_axis = eligible[0] if eligible else ordered[0]
        log_event(
            "wrapup_deferred",
            session_id=current["session_id"],
            turn=turn,
            axis=deferred_axis,
        )
    if not eligible:
        return mode, None, False, future

    axis = eligible[0]
    attempts = current["axis_hints"].get(axis, [])
    retry = bool(attempts)
    attempts.append(turn)
    current["axis_hints"][axis] = attempts
    log_event(
        "axis_hint",
        session_id=current["session_id"],
        turn=turn,
        axis=axis,
        attempt=len(attempts),
        mode=mode,
    )
    return mode, prompts.AXIS_HINT_TOPICS[axis], retry, future


def _text_stream(
    current: session.Session,
    user_text: str | None,
    settings: Settings,
    mode: prompts.PacingMode,
    hint_topic: str | None,
    retry: bool,
    future: bool,
) -> AsyncIterator[tuple[str, dict[str, int] | None]]:
    """Select the configured interviewer text stream."""
    if settings.interview_provider == "claude":
        return _claude_text_stream(
            current,
            user_text,
            settings,
            mode,
            hint_topic,
            retry,
            future,
        )
    return _gemini_text_stream(
        current,
        user_text,
        settings,
        mode,
        hint_topic,
        retry,
        future,
    )


async def _gemini_text_stream(
    current: session.Session,
    user_text: str | None,
    settings: Settings,
    mode: prompts.PacingMode,
    hint_topic: str | None,
    retry: bool,
    future: bool,
) -> AsyncIterator[tuple[str, dict[str, int] | None]]:
    """Yield Gemini interviewer text and usage updates."""
    contents = _build_contents(current, user_text, mode, hint_topic, retry, future)
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
    async for chunk in stream:
        usage = (
            gemini.token_usage(chunk.usage_metadata)
            if chunk.usage_metadata is not None
            else None
        )
        yield chunk.text or "", usage


async def _claude_text_stream(
    current: session.Session,
    user_text: str | None,
    settings: Settings,
    mode: prompts.PacingMode,
    hint_topic: str | None,
    retry: bool,
    future: bool,
) -> AsyncIterator[tuple[str, dict[str, int] | None]]:
    """Yield Claude interviewer text and final usage."""
    if settings.file_search_store_name:
        log_event("file_search_skipped", session_id=current["session_id"])
    async with claude.get_client().messages.stream(
        model=settings.claude_model,
        max_tokens=4096,
        thinking=_claude_thinking(settings.claude_model),
        system=[
            {
                "type": "text",
                "text": prompts.build_fixed_prefix(current["age_2040"]),
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=_build_claude_messages(
            current,
            user_text,
            mode,
            hint_topic,
            retry,
            future,
        ),
    ) as stream:
        async for text in stream.text_stream:
            yield text, None
        final = await stream.get_final_message()
        yield "", claude.token_usage(final.usage)


def _claude_thinking(model: str) -> dict[str, str | int]:
    """Pick the thinking form each Claude generation accepts."""
    # Haiku 4.5 predates adaptive thinking and rejects it, while 4.6+ models reject budget_tokens.
    if "haiku-4-5" in model:
        return {"type": "enabled", "budget_tokens": 2048}
    return {"type": "adaptive"}


def _build_claude_messages(
    current: session.Session,
    user_text: str | None,
    mode: prompts.PacingMode,
    hint_topic: str | None = None,
    retry: bool = False,
    future: bool = False,
) -> list[dict[str, str]]:
    """Build text-only Claude messages with the current instruction last."""
    messages = [
        {
            "role": "user" if message["role"] == "user" else "assistant",
            "content": message["text"],
        }
        for message in current["messages"]
    ]
    text = (
        prompts.build_opening_instruction()
        if user_text is None
        else prompts.append_operational_instruction(
            user_text,
            mode,
            hint_topic,
            retry,
            future,
        )
    )
    messages.append({"role": "user", "content": text})
    return messages


def _build_contents(
    current: session.Session,
    user_text: str | None,
    mode: prompts.PacingMode,
    hint_topic: str | None = None,
    retry: bool = False,
    future: bool = False,
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

    assembled = prompts.append_operational_instruction(
        user_text,
        mode,
        hint_topic,
        retry,
        future,
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
    mode: prompts.PacingMode,
    user_text: str | None,
    assistant_text: str,
) -> bool:
    """Decide whether this session has earned the right to close on this turn."""
    if user_text is not None and _matches(user_text, STOP_MARKS):
        return True
    return mode == "closing" and not _matches(assistant_text, ANSWER_DEMANDS)


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
    return min(int(turn / settings.interview_target_turns * 100), 99)


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
