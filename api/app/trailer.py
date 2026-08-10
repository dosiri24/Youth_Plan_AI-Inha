from dataclasses import dataclass

_END_MARKER = "[[END_INTERVIEW]]"
_ABORT_MARKER = "[[ABORT_INTERVIEW]]"


@dataclass(frozen=True)
class TrailerResult:
    """Represent control-token state and any final safe participant text."""

    text: str
    ended: bool
    aborted: bool


class TrailerParser:
    """Separate participant text from incrementally streamed control tokens."""

    def __init__(self) -> None:
        """Initialize an empty incremental parsing state."""
        self._pending = ""
        self._trailer: list[str] = []
        self._in_trailer = False

    def feed(self, chunk: str) -> str:
        """Return only text proven safe to expose from one stream chunk."""
        if self._in_trailer:
            self._trailer.append(chunk)
            return ""

        combined = self._pending + chunk
        self._pending = ""
        marker_index = combined.find("[[")
        if marker_index >= 0:
            self._in_trailer = True
            self._trailer.append(combined[marker_index:])
            return combined[:marker_index]

        if combined.endswith("["):
            self._pending = "["
            return combined[:-1]
        return combined

    def finish(self) -> TrailerResult:
        """Release safe pending text and detect buffered control tokens."""
        text = "" if self._in_trailer else self._pending
        self._pending = ""
        trailer = "".join(self._trailer)
        return TrailerResult(
            text=text,
            ended=_END_MARKER in trailer,
            aborted=_ABORT_MARKER in trailer,
        )
