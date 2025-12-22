## syntax=docker/dockerfile:1.7

# Base stage - can be overridden via docker-bake.hcl contexts
ARG PYTHON_BASE=python:3.12-slim

FROM ${PYTHON_BASE} AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Runtime tools for healthcheck (skip if already in base)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* || true

# Create non-root user (skip if already exists)
RUN (getent group app || addgroup --system --gid 10001 app) && \
    (getent passwd app || adduser --system --uid 10001 --ingroup app app)

# Install dependencies (use pip cache mount)
COPY apps/scrapper/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# Copy application
COPY apps/scrapper/main.py ./

# Runtime data (session, optional downloads)
ENV DOWNLOADS_DIR=/data/downloads \
    SESSION_FILE=/data/session \
    PORT=8001 \
    RELOAD=false

RUN mkdir -p /data/downloads && \
    chown -R app:app /data

USER app

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
    CMD curl -fsS "http://localhost:${PORT}/health" >/dev/null || exit 1

CMD ["sh", "-lc", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
