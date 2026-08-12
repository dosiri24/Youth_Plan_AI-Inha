"""Convert the interview-lab markdown records into one frozen machine-readable corpus."""

import json
import re
import unicodedata
from pathlib import Path

LAB_DIR = Path(__file__).resolve().parents[3] / "docs" / "interview-lab"
OUTPUT_PATH = LAB_DIR / "corpus.json"

_TRANSCRIPT_START = "대화 전문"
_TRANSCRIPT_END = "인터뷰어에게서"
_HEADING = re.compile(r"^#{1,6}\s")
_BOLD_SPEAKER = re.compile(r"^\*\*(?P<label>[^*]+)\*\*(?P<rest>.*)$")
_BULLET_SPEAKER = re.compile(r"^-\s*(?P<label>[^:]{1,12}):\s*(?P<rest>.*)$")
# The twelve records label turns four different ways; only the speaker residue identifies a role.
_TURN_MARKS = re.compile(
    r"턴\s*\d*|\d+\s*턴|[Tt]urn\s*\d*|시작\s*인사|첫\s*인사|시작\s*발화|종료|시작|끝|\d+"
)
_LABEL_NOISE = re.compile(r"[\[\]()·,:;\-–—.]")
# The records were captured through the CLI, which appends its own state line to some turns.
_CLI_ARTIFACT = re.compile(r"`?\[상태\][^\n`]*`?")
_INTERVIEWER_NAMES = ("인터뷰어", "하늘")
_PARTICIPANT_NAME = re.compile(r"^[가-힣]{2,4}$")


def build() -> list[dict[str, object]]:
    """Parse every numbered lab record into the runtime transcript shape."""
    records = []
    for path in sorted(LAB_DIR.glob("[0-9][0-9]-*.md")):
        if path.stem.startswith("00"):
            continue
        # macOS stores Hangul filenames decomposed, so names are composed before they are keys.
        name = unicodedata.normalize("NFC", path.stem)
        records.append({"name": name, "messages": _parse(path.read_text(encoding="utf-8"))})
    return records


def _parse(markdown: str) -> list[dict[str, object]]:
    """Extract ordered speaker turns from one record's transcript section."""
    messages: list[dict[str, object]] = []
    turn = 0
    role = ""
    body: list[str] = []

    for line in _transcript_lines(markdown):
        marker = _speaker(line.strip())
        if marker is None:
            if role:
                body.append(_strip_quote(line))
            continue

        next_role, rest = marker
        if next_role is None:
            continue
        if role:
            messages.append({"turn": turn, "role": role, "text": _join(body)})
        role = next_role
        # The backend numbers a turn by its participant utterance, so the greeting stays at zero.
        if role == "user":
            turn += 1
        body = [_strip_quote(rest)]

    if role:
        messages.append({"turn": turn, "role": role, "text": _join(body)})
    return [message for message in messages if message["text"]]


def _speaker(line: str) -> tuple[str | None, str] | None:
    """Classify one line as a speaker start, a turn header, or plain body text."""
    bold = _BOLD_SPEAKER.match(line)
    if bold is not None:
        return _role(bold.group("label")), bold.group("rest").lstrip(":").strip()

    bullet = _BULLET_SPEAKER.match(line)
    if bullet is not None:
        role = _role(bullet.group("label"))
        if role is not None:
            return role, bullet.group("rest")
    return None


def _role(label: str) -> str | None:
    """Return the speaker role behind a label, or None for a bare turn header."""
    residue = _LABEL_NOISE.sub(" ", _TURN_MARKS.sub(" ", label)).strip()
    if not residue:
        return None
    if any(name in residue for name in _INTERVIEWER_NAMES):
        return "assistant"
    return "user" if _PARTICIPANT_NAME.match(residue) or residue in ("나", "참여자") else None


def _transcript_lines(markdown: str) -> list[str]:
    """Return only the lines between the transcript heading and the analysis heading."""
    lines = markdown.splitlines()
    start = next(
        index
        for index, line in enumerate(lines)
        if _HEADING.match(line) and _TRANSCRIPT_START in line
    )
    end = next(
        (
            index
            for index, line in enumerate(lines[start + 1 :], start + 1)
            if _HEADING.match(line) and _TRANSCRIPT_END in line
        ),
        len(lines),
    )
    return [line for line in lines[start + 1 : end] if not _HEADING.match(line)]


def _strip_quote(line: str) -> str:
    """Remove one level of blockquote marker so quoted and plain records match."""
    stripped = line.strip()
    if stripped.startswith(">"):
        return stripped[1:].strip()
    return stripped


def _join(body: list[str]) -> str:
    """Join one utterance's lines, keeping paragraph breaks and dropping padding."""
    text = _CLI_ARTIFACT.sub("", "\n".join(body))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def main() -> None:
    """Write the corpus and print one verification line per record."""
    records = build()
    OUTPUT_PATH.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    for record in records:
        messages = record["messages"]
        users = [message for message in messages if message["role"] == "user"]
        assistants = [message for message in messages if message["role"] == "assistant"]
        chars = sum(len(message["text"]) for message in messages)
        print(
            f"{record['name']}: turns={max(m['turn'] for m in messages)} "
            f"user={len(users)} assistant={len(assistants)} chars={chars}"
        )
    print(f"records={len(records)} -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
