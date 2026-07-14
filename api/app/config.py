from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Define environment-backed application settings."""

    gemini_api_key: str
    gemini_model: str = "gemini-3.5-flash"
    file_search_store_name: str | None = None
    gcp_project_id: str | None = None
    interview_target_turns: int = 15
    interview_wrapup_turn: int = 12
    axis_min_evidence: int = 2

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings."""
    return Settings()
