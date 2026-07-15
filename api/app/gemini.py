from google import genai

from app.config import get_settings

_client: genai.Client | None = None


def get_client() -> genai.Client:
    """Return the lazily constructed Gemini client."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key)
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
