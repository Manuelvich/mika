#!/usr/bin/env sh
set -eu

# Safe rebuild: never stops or removes the current stack until new images build successfully.
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"

echo "1/5 Validating Compose configuration..."
docker compose config >/dev/null

echo "2/5 Checking required base images..."
docker pull postgres:16-alpine
docker pull python:3.12.9-slim
docker pull node:22.14-alpine
docker pull nginx:1.27.4-alpine
# TURN failure must not block messenger recovery.
docker pull coturn/coturn:4.6-alpine || true

echo "3/5 Building new application images while existing containers remain untouched..."
DOCKER_BUILDKIT=1 docker compose build --pull --no-cache backend web

echo "4/5 Starting/recreating services..."
docker compose up -d --force-recreate --remove-orphans

echo "5/5 Current state..."
docker compose ps

echo
echo "If backend is not healthy, run:"
echo "  docker compose logs --tail=200 backend"
echo "Do not use 'docker compose down -v' because it deletes the database and uploaded files."
