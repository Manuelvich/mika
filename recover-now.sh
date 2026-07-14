#!/usr/bin/env sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"

echo "Validating configuration..."
docker compose config >/dev/null

echo "Building missing application images..."
DOCKER_BUILDKIT=1 docker compose build --pull backend web

echo "Starting messenger services..."
docker compose up -d --remove-orphans

echo "Status:"
docker compose ps
