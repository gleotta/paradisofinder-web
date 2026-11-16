#!/bin/bash
# paradisofinder.com — P1: actualizar el Docker del usuario (el del :3000) al
# código actual del árbol de trabajo.
#
# Es el `docker compose up -d --build` de siempre (docs/DOCKER.md), con espera
# de healthy y el smoke de scripts/ci/smoke.mjs para no quedarte con un
# contenedor arriba pero roto o sirviendo mocks. Si el build falla, Compose no
# toca el contenedor que está corriendo. ~40 s de corte mientras se recrea.
#
# Uso:  ./scripts/actualizar_3000.sh

set -u -o pipefail
cd "$(dirname "$0")/.."

CONTAINER=paradisofinder-web

echo ">>> build + recreate del Docker del :3000"
docker compose up -d --build 2>&1 | tail -6 || { echo "ERROR: el build o el arranque fallaron (el contenedor anterior sigue como estaba)."; exit 1; }

echo ""
echo ">>> esperando healthy"
DEADLINE=$(( $(date +%s) + 180 ))
until [ "$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null)" = healthy ]; do
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "ERROR: no llegó a healthy en 180 s. Últimos logs:"
    docker logs --tail 40 "$CONTAINER" 2>&1 | sed 's/^/    /'
    exit 1
  fi
  sleep 3
done
echo "healthy"

echo ""
echo ">>> smoke (P1 :3000 contra el P2 local :8000)"
SMOKE_P2_BASE_URL="${SMOKE_P2_BASE_URL:-http://localhost:8000}" \
  node scripts/ci/smoke.mjs http://localhost:3000 || exit 1

echo ""
echo "=================================================="
echo "  :3000 ACTUALIZADO y andando — http://localhost:3000"
