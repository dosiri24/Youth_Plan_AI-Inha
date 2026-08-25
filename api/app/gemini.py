from google import genai
from google.genai import types

from app.config import get_settings

REQUEST_TIMEOUT_MS = 120_000
RETRY_ATTEMPTS = 2

_client: genai.Client | None = None


def get_client() -> genai.Client:
    """Return the lazily constructed Gemini client."""
    global _client
    if _client is None:
        # The SDK otherwise creates httpx without a timeout and disables retries, so a
        # stalled response could block an admin request; two attempts fit Cloud Run's 300s limit.
        _client = genai.Client(
            api_key=get_settings().gemini_api_key,
            http_options=types.HttpOptions(
                timeout=REQUEST_TIMEOUT_MS,
                retry_options=types.HttpRetryOptions(attempts=RETRY_ATTEMPTS),
            ),
        )
    return _client


def token_usage(metadata: object | None) -> dict[str, int] | None:
    """Extract integer token counters from Gemini usage metadata."""
    if metadata is None:
        return None
    names = (
        "prompt_token_count",
        "candidates_token_count",
        "total_token_count",
        "cached_content_token_count",
        "tool_use_prompt_token_count",
        "thoughts_token_count",
    )
    usage = {name: value for name in names if type(value := getattr(metadata, name, None)) is int}
    return usage or None
