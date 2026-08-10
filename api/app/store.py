from abc import ABC, abstractmethod
from typing import Any

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


class InMemorySubmissionStore(SubmissionStore):
    """Hold submissions in process memory until a Firestore backend replaces it."""

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

    @staticmethod
    def _with_id(submission_id: str, document: Document) -> Document:
        """Mirror Firestore reads that surface the document id beside its fields."""
        return {**document, "submission_id": submission_id}


_store: SubmissionStore = InMemorySubmissionStore()


def get_store() -> SubmissionStore:
    """Return the active submission store."""
    return _store
