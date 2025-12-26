# =============================================================================
# Multi-stage Dockerfile for mem0 API server
# Build context: repository root (not server/)
# Usage: docker build -f server/Dockerfile -t mem0-server .
# =============================================================================

# Base image configuration
ARG PYTHON_VERSION=3.12
ARG VARIANT=slim

# Build-time arguments for versioning and labels
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown

# OCI label arguments (defaults to upstream, override in CI for fork)
ARG OCI_SOURCE="https://github.com/mem0ai/mem0"
ARG OCI_URL="https://mem0.ai"
ARG OCI_VENDOR="Mem0"
ARG OCI_AUTHORS=""

# -----------------------------------------------------------------------------
# Stage 1: Build dependencies with uv
# -----------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-${VARIANT} AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy workspace files (structure must match uv workspace layout)
COPY pyproject.toml uv.lock README.md LICENSE ./
COPY server/pyproject.toml ./server/
COPY mem0/ ./mem0/

# Sync server package (installs mem0ai from local workspace)
ENV UV_COMPILE_BYTECODE=1
RUN uv sync --frozen --no-dev --package mem0-server --no-editable

# -----------------------------------------------------------------------------
# Stage 2: Runtime image
# -----------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-${VARIANT} AS runtime

# Re-declare ARGs for use in this stage
ARG PYTHON_VERSION
ARG VARIANT
ARG VERSION
ARG COMMIT
ARG BUILD_DATE
ARG OCI_SOURCE
ARG OCI_URL
ARG OCI_VENDOR
ARG OCI_AUTHORS

# OCI Image Format Specification labels
# https://github.com/opencontainers/image-spec/blob/main/annotations.md
LABEL org.opencontainers.image.title="mem0-server" \
      org.opencontainers.image.description="REST API server for Mem0 - Long-term memory for AI Agents" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="${OCI_SOURCE}" \
      org.opencontainers.image.url="${OCI_URL}" \
      org.opencontainers.image.documentation="https://docs.mem0.ai" \
      org.opencontainers.image.vendor="${OCI_VENDOR}" \
      org.opencontainers.image.authors="${OCI_AUTHORS}" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.base.name="python:${PYTHON_VERSION}-${VARIANT}"

# Install curl for healthcheck, create non-root user
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --gid 65532 nonroot && \
    useradd --uid 65532 --gid nonroot --shell /bin/false --create-home nonroot

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --chown=nonroot:nonroot server/ .

RUN mkdir -p /app/history && chown -R nonroot:nonroot /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    MEM0_VERSION="${VERSION}" \
    MEM0_COMMIT="${COMMIT}"

USER nonroot

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost:8000/health

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
