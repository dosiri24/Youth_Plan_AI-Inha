from dataclasses import dataclass

_END_MARKER = "[[END_INTERVIEW]]"
_MALICIOUS_MARKER = "[[MALICIOUS_RESPONSE]]"
# Decoration characters that never carry meaning in Korean prose, so removal is lossless.
_DECORATION = "*_`~"
_LINE_LEAD = "#>-•"


@dataclass(frozen=True)
class TrailerResult:
    """Represent control-token state and any final safe participant text."""

    text: str
    ended: bool
    malicious: bool


class TrailerParser:
    """Separate participant text from control tokens and strip formatting as it streams."""

    def __init__(self) -> None:
        """Initialize an empty incremental parsing state."""
        self._pending = ""
        self._trailer: list[str] = []
        self._in_trailer = False
        self._at_line_start = True

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
            return self._strip(combined[:marker_index])

        if combined.endswith("["):
            self._pending = "["
            return self._strip(combined[:-1])
        return self._strip(combined)

    def finish(self) -> TrailerResult:
        """Release safe pending text and detect buffered control tokens."""
        text = "" if self._in_trailer else self._strip(self._pending)
        self._pending = ""
        trailer = "".join(self._trailer)
        return TrailerResult(
            text=text,
            ended=_END_MARKER in trailer,
            malicious=_MALICIOUS_MARKER in trailer,
        )

    def _strip(self, text: str) -> str:
        """Remove markdown decoration, which the prompt forbids and the chat view cannot render."""
        kept = []
        for character in text:
            if character in _DECORATION:
                continue
            # A heading or bullet marker takes its trailing space with it.
            if self._at_line_start and character in _LINE_LEAD + " \t":
                continue
            if character == "\n":
                self._at_line_start = True
            elif not character.isspace():
                self._at_line_start = False
            kept.append(character)
        return "".join(kept)
