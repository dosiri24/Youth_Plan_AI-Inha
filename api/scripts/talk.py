"""Drive one interview over HTTP so an outside interviewee needs no client of its own.

Standard library only, so it runs with any python3 and no project environment.
Set API_BASE_URL to target a different server; it defaults to the deployed one.

  python3 api/scripts/talk.py new 2001
  python3 api/scripts/talk.py start <session_id>
  python3 api/scripts/talk.py say <session_id> "안녕하세요"
  python3 api/scripts/talk.py result <session_id>
  python3 api/scripts/talk.py submit <session_id>
  python3 api/scripts/talk.py drop <session_id>
"""

import json
import os
import sys
import urllib.request

BASE = os.environ.get("API_BASE_URL", "https://api-435235910956.asia-northeast3.run.app").rstrip(
    "/"
)


def post(path: str, payload: dict | None = None) -> urllib.request.addinfourl:
    """Send one JSON POST and return the still-open response."""
    body = None if payload is None else json.dumps(payload).encode()
    headers = {} if body is None else {"Content-Type": "application/json"}
    request = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method="POST")
    return urllib.request.urlopen(request, timeout=300)


def stream(path: str, payload: dict | None = None) -> None:
    """Print one interview turn as it arrives, then its end state."""
    parts = []
    state = "unknown"
    with post(path, payload) as response:
        for raw in response:
            line = raw.decode("utf-8").rstrip("\n")
            if not line.startswith("data:"):
                continue
            data = json.loads(line[5:].strip())
            if "text" in data:
                parts.append(data["text"])
            if "state" in data:
                state = data["state"]
    print("".join(parts))
    print(f"\n[상태] {state}")


def main() -> None:
    """Run one interview command."""
    command = sys.argv[1]

    if command == "new":
        with post("/api/sessions", {"birth_year": int(sys.argv[2])}) as response:
            print(json.load(response)["session_id"])
        return

    session_id = sys.argv[2]

    if command == "start":
        stream(f"/api/sessions/{session_id}/start")
        return

    if command == "say":
        stream(f"/api/sessions/{session_id}/messages", {"text": sys.argv[3]})
        return

    if command == "result":
        with post(f"/api/sessions/{session_id}/result") as response:
            print(json.dumps(json.load(response), ensure_ascii=False, indent=2))
        return

    if command == "submit":
        with post(f"/api/sessions/{session_id}/submit") as response:
            print(json.load(response)["submission_id"])
        return

    if command == "drop":
        request = urllib.request.Request(f"{BASE}/api/sessions/{session_id}", method="DELETE")
        with urllib.request.urlopen(request, timeout=60) as response:
            print(response.status)
        return

    raise SystemExit(f"unknown command: {command}")


main()
