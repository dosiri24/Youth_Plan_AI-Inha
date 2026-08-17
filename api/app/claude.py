from anthropic import AsyncAnthropic

from app.config import get_settings

_client: AsyncAnthropic | None = None


def get_client() -> AsyncAnthropic:
    """Return the lazily constructed Anthropic client."""
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=get_settings().claude_api_key)
    return _client


def token_usage(usage: object | None) -> dict[str, int] | None:
    """Extract integer token counters from Anthropic usage metadata."""
    if usage is None:
        return None
    names = (
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    )
    counters = {
        name: value for name in names if type(value := getattr(usage, name, None)) is int
    }
    return counters or None
