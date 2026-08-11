FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY api/pyproject.toml api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api/app ./app
COPY api/prompts ./prompts
COPY api/fixtures ./fixtures
COPY data/plan2040_summary.md /data/plan2040_summary.md

CMD ["sh", "-c", "exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8080}\""]
