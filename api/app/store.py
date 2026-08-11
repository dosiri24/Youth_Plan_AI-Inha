from abc import ABC, abstractmethod
from typing import Any

from google.cloud.firestore_v1 import Query

from app.config import get_settings
from app.firestore import get_client

Document = dict[str, Any]


class SubmissionStore(ABC):
    """Define the submission persistence contract shared across backends."""

    @abstractmethod
    def save(self, submission_id: str, document: Document) -> None:
        """Persist one complete submission document under its id."""

    @abstractmethod
    def list(self) -> list[Document]:
        """Return every stored submission document with its id."""

    @abstractmethod
    def get(self, submission_id: str) -> Document | None:
        """Return one submission document with its id, or None when absent."""

    @abstractmethod
    def delete(self, submission_id: str) -> bool:
        """Delete one submission and report whether it existed."""


class AnalysisStore(ABC):
    """Define the analysis-run persistence contract shared across backends."""

    @abstractmethod
    def save(self, run_id: str, document: Document) -> None:
        """Persist one complete analysis document under its id."""

    @abstractmethod
    def latest(self) -> Document | None:
        """Return the most recently saved analysis document or None."""


class InMemorySubmissionStore(SubmissionStore):
    """Hold submissions in process memory when no GCP project is configured."""

    def __init__(self) -> None:
        """Start with an empty submission map."""
        self._documents: dict[str, Document] = {}

    def save(self, submission_id: str, document: Document) -> None:
        """Store one submission document keyed by its id."""
        self._documents[submission_id] = document

    def list(self) -> list[Document]:
        """Return all stored submissions, each carrying its own id."""
        return [self._with_id(sid, doc) for sid, doc in self._documents.items()]

    def get(self, submission_id: str) -> Document | None:
        """Return one stored submission carrying its id when present."""
        document = self._documents.get(submission_id)
        if document is None:
            return None
        return self._with_id(submission_id, document)

    def delete(self, submission_id: str) -> bool:
        """Delete one stored submission and report whether it existed."""
        if submission_id not in self._documents:
            return False
        del self._documents[submission_id]
        return True

    @staticmethod
    def _with_id(submission_id: str, document: Document) -> Document:
        """Mirror Firestore reads that surface the document id beside its fields."""
        return {**document, "submission_id": submission_id}


class InMemoryAnalysisStore(AnalysisStore):
    """Hold the latest analysis run in memory when no GCP project is configured."""

    def __init__(self) -> None:
        """Start without a saved analysis run."""
        self._latest_id: str | None = None
        self._latest_document: Document | None = None

    def save(self, run_id: str, document: Document) -> None:
        """Replace the latest analysis document and its id."""
        self._latest_id = run_id
        self._latest_document = document

    def latest(self) -> Document | None:
        """Return the last saved analysis carrying its own id."""
        if self._latest_id is None:
            return None
        return self._with_id(self._latest_id, self._latest_document)

    @staticmethod
    def _with_id(run_id: str, document: Document) -> Document:
        """Mirror Firestore reads that surface the document id beside its fields."""
        return {**document, "run_id": run_id}


class FirestoreSubmissionStore(SubmissionStore):
    """Persist submissions in the contracted Firestore collection."""

    def save(self, submission_id: str, document: Document) -> None:
        """Store one submission under its Firestore document id."""
        body = {key: value for key, value in document.items() if key != "submission_id"}
        get_client().collection("submissions").document(submission_id).set(body)

    def list(self) -> list[Document]:
        """Return every submission with its Firestore document id."""
        return [
            {**snapshot.to_dict(), "submission_id": snapshot.id}
            for snapshot in get_client().collection("submissions").stream()
        ]

    def get(self, submission_id: str) -> Document | None:
        """Return one submission with its Firestore document id when present."""
        snapshot = get_client().collection("submissions").document(submission_id).get()
        if not snapshot.exists:
            return None
        return {**snapshot.to_dict(), "submission_id": snapshot.id}

    def delete(self, submission_id: str) -> bool:
        """Delete one Firestore submission and report whether it existed."""
        reference = get_client().collection("submissions").document(submission_id)
        if not reference.get().exists:
            return False
        reference.delete()
        return True


class FirestoreAnalysisStore(AnalysisStore):
    """Persist analysis runs in the contracted Firestore collection."""

    def save(self, run_id: str, document: Document) -> None:
        """Store one analysis run under its Firestore document id."""
        body = {key: value for key, value in document.items() if key != "run_id"}
        get_client().collection("analysis_runs").document(run_id).set(body)

    def latest(self) -> Document | None:
        """Return the most recently executed Firestore analysis run."""
        snapshots = (
            get_client()
            .collection("analysis_runs")
            .order_by("executed_at", direction=Query.DESCENDING)
            .limit(1)
            .stream()
        )
        snapshot = next(snapshots, None)
        if snapshot is None:
            return None
        return {**snapshot.to_dict(), "run_id": snapshot.id}


_store: SubmissionStore | None = None
_analysis_store: AnalysisStore | None = None


def get_store() -> SubmissionStore:
    """Return the active submission store."""
    global _store
    if _store is None:
        if get_settings().gcp_project_id:
            _store = FirestoreSubmissionStore()
        else:
            _store = InMemorySubmissionStore()
    return _store


def get_analysis_store() -> AnalysisStore:
    """Return the active analysis store."""
    global _analysis_store
    if _analysis_store is None:
        if get_settings().gcp_project_id:
            _analysis_store = FirestoreAnalysisStore()
        else:
            _analysis_store = InMemoryAnalysisStore()
    return _analysis_store
