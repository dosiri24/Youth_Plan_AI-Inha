from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Define environment-backed application settings."""

    gemini_api_key: str
    gemini_model: str = "gemini-3.7-flash"
    claude_api_key: str = ""
    interview_provider: str = "gemini"
    claude_model: str = "claude-haiku-4-5-20251001"
    file_search_store_name: str | None = None
    gcp_project_id: str | None = None
    interview_target_turns: int = 18
    interview_future_turn: int = 8
    interview_hint_turn: int = 10
    interview_wrapup_turn: int = 15
    interview_max_extra_turns: int = 4
    dev_mode: bool = False
    access_code: str = ""
    web_origin: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings."""
    return Settings()
