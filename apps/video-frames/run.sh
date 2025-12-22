#!/bin/bash
set -e

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Default values
PORT=${PORT:-8002}
RELOAD=${RELOAD:-true}

echo "Starting Video Frames Service on port $PORT..."

if [ "$RELOAD" = "true" ]; then
    uvicorn main:app --host 0.0.0.0 --port "$PORT" --reload
else
    uvicorn main:app --host 0.0.0.0 --port "$PORT"
fi

