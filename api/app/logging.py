import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any


class JsonFormatter(logging.Formatter):
    """Format log records as structured JSON."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize one log record as structured JSON."""
        payload = dict(getattr(record, "event_fields", {}))
        payload.update(
            timestamp=datetime.fromtimestamp(record.created, UTC).isoformat(),
            level=record.levelname,
            event=getattr(record, "event", record.name),
        )
        message = record.getMessage()
        session_id = getattr(record, "session_id", None)
        token_usage = getattr(record, "token_usage", None)
        if message:
            payload["message"] = message
        if session_id is not None:
            payload["session_id"] = session_id
        if token_usage is not None:
            payload["token_usage"] = token_usage
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


logger = logging.getLogger("youth_plan_api")


def configure_logging() -> None:
    """Configure structured JSON logging to standard output."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True


def log_event(
    event: str,
    *,
    session_id: str | None = None,
    token_usage: dict[str, int] | None = None,
    **fields: Any,
) -> None:
    """Log an event with optional structured metadata."""
    logger.info(
        "",
        extra={
            "event": event,
            "session_id": session_id,
            "token_usage": token_usage,
            "event_fields": fields,
        },
    )
