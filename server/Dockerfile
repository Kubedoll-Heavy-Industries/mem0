# =============================================================================
# Multi-stage Dockerfile for mem0 API server
# Build context: repository root (not server/)
# Usage: docker build -f server/Dockerfile -t mem0-server .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build dependencies with uv
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy all files needed for workspace resolution
COPY pyproject.toml uv.lock ./
COPY server/pyproject.toml ./server/
COPY mem0/ ./mem0/
COPY README.md LICENSE ./

# Sync server package (installs mem0ai from local workspace)
ENV UV_COMPILE_BYTECODE=1
RUN uv sync --frozen --no-dev --package mem0-server --no-editable

# -----------------------------------------------------------------------------
# Stage 2: Runtime image
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# Security: Create non-root user with high UID (distroless convention)
# Create home directory for mem0 config/telemetry storage
RUN groupadd --gid 65532 nonroot && \
    useradd --uid 65532 --gid nonroot --shell /bin/false --create-home nonroot

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy server application code
COPY --chown=nonroot:nonroot server/ .

# Create data directories with correct ownership
RUN mkdir -p /app/history && chown -R nonroot:nonroot /app

# Environment configuration
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

USER nonroot

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
