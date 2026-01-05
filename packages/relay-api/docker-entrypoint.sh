#!/bin/sh
set -e

echo "==> Running database migrations..."
pnpm exec prisma migrate deploy

echo "==> Starting relay-api server..."
exec "$@"
