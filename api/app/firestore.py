from google.cloud import firestore

from app.config import get_settings

_client: firestore.Client | None = None


def get_client() -> firestore.Client:
    """Return the lazily constructed Firestore client."""
    global _client
    if _client is None:
        _client = firestore.Client(project=get_settings().gcp_project_id)
    return _client
