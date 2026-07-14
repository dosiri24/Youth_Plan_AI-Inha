import sys
import time
from pathlib import Path
from typing import cast

from google.genai import types

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parent
PLAN_DIR = REPO_ROOT / "data" / "plan2040"
STORE_DISPLAY_NAME = "youth-plan-ai-incheon-2040"

sys.path.insert(0, str(API_ROOT))

from app.config import get_settings  # noqa: E402
from app.gemini import get_client  # noqa: E402
from app.logging import configure_logging, log_event  # noqa: E402


def main() -> int:
    """Upload all preprocessed 2040 plan documents into one File Search store."""
    document_paths = sorted(PLAN_DIR.rglob("*.md"))
    if not document_paths:
        sys.stderr.write(
            "Error: preprocessed 도시기본계획 documents do not exist yet in data/plan2040/.\n"
        )
        return 1

    configure_logging()
    settings = get_settings()
    client = get_client()
    store_name = settings.file_search_store_name

    if store_name:
        log_event("plan_file_search_store_reused", file_search_store_name=store_name)
    else:
        store = client.file_search_stores.create(
            config=types.CreateFileSearchStoreConfig(display_name=STORE_DISPLAY_NAME),
        )
        store_name = cast(str, store.name)
        log_event("plan_file_search_store_created", file_search_store_name=store_name)

    for document_path in document_paths:
        relative_path = document_path.relative_to(PLAN_DIR)
        log_event("plan_document_upload_started", document_path=str(relative_path))
        operation = client.file_search_stores.upload_to_file_search_store(
            file_search_store_name=store_name,
            file=document_path,
            config=types.UploadToFileSearchStoreConfig(
                display_name=document_path.stem,
                mime_type="text/markdown",
            ),
        )
        while not operation.done:
            time.sleep(2)
            operation = client.operations.get(operation)
        log_event("plan_document_upload_completed", document_path=str(relative_path))

    sys.stdout.write(f"file_search_store_name={store_name}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
