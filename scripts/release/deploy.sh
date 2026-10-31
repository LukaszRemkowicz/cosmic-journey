#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

compose=(docker compose --project-name cosmic-journey -f docker-compose.yaml -f docker-compose.prod.yaml)
"${compose[@]}" config --quiet
docker network inspect traefik_proxy >/dev/null
docker image inspect cosmic-journey:latest >/dev/null
"${compose[@]}" down --remove-orphans
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 60 web
docker image prune --all --force --filter label=com.cosmic-journey.release=true
