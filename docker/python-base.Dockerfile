## syntax=docker/dockerfile:1.7

# Shared Python base image for scrapper and video-frames services
FROM python:3.12-slim AS python-base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Runtime tools for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 10001 app && \
    adduser --system --uid 10001 --ingroup app app
