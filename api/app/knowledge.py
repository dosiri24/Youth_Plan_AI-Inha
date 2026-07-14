from functools import lru_cache
from pathlib import Path

from google.genai import types

from app.config import get_settings
from app.logging import log_event

_SUMMARY_PATH = Path(__file__).resolve().parents[2] / "data" / "plan2040_summary.md"


@lru_cache(maxsize=1)
def load_plan_summary() -> str:
    """Return the cached human-written 2040 plan summary when available."""
    if not _SUMMARY_PATH.is_file():
        log_event("plan_summary_absent", path=str(_SUMMARY_PATH))
        return ""
    return _SUMMARY_PATH.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def file_search_tool() -> types.Tool | None:
    """Return the configured Gemini File Search tool when available."""
    store_name = get_settings().file_search_store_name
    if not store_name:
        log_event("file_search_store_unset")
        return None
    return types.Tool(
        file_search=types.FileSearch(file_search_store_names=[store_name]),
    )
