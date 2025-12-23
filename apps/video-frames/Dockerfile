## syntax=docker/dockerfile:1.7

# Base stage - can be overridden via docker-bake.hcl contexts
ARG PYTHON_BASE=python:3.12-slim

FROM ${PYTHON_BASE} AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Runtime tools for healthcheck + FFmpeg for frame extraction + OpenCV deps for PySceneDetect
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl ca-certificates ffmpeg \
        # OpenCV dependencies for PySceneDetect (libgl1 replaces libgl1-mesa-glx in Debian 13+)
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user (skip if already exists)
RUN (getent group app || addgroup --system --gid 10001 app) && \
    (getent passwd app || adduser --system --uid 10001 --ingroup app app)

# Install dependencies (use pip cache mount)
COPY apps/video-frames/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# Copy application
COPY apps/video-frames/main.py apps/video-frames/tracing.py ./

# Runtime configuration
ENV PORT=8002 \
    RELOAD=false \
    FRAME_INTERVAL_SEC=2.0 \
    MAX_FRAMES=30 \
    JPEG_QUALITY=85

USER app

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
    CMD curl -fsS "http://localhost:${PORT}/health" >/dev/null || exit 1

CMD ["sh", "-lc", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
