#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Free ports left over from a previous run so startup doesn't fail
for port in 8000 3000; do
  pids="$(lsof -ti tcp:"$port" || true)"
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
done

pids=()

# Kill both processes on Ctrl+C so no orphans remain
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

( cd "$ROOT/api" && uv run uvicorn app.main:app --port 8000 ) &
pids+=($!)

( cd "$ROOT/web" && pnpm dev ) &
pids+=($!)

wait
