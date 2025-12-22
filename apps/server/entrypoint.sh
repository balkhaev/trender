#!/bin/sh
set -e

echo "Running database migrations..."
cd /repo/packages/db
./node_modules/.bin/prisma migrate deploy --config=./prisma.config.ts

echo "Starting server..."
cd /repo/apps/server
exec bun ./dist/index.mjs

