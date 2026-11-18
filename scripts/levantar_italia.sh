#!/usr/bin/env bash
# Levanta P1 para el mercado ITALIA (imagen finder-web-italia, puerto 3010)
# sin tocar el stack de San Juan. Necesita P2 Italia en :8010.
#   ./scripts/levantar_italia.sh                levanta (construye si hace falta)
#   ITALIA_THEME=era ./scripts/levantar_italia.sh   con la paleta de ERA
#   ./scripts/levantar_italia.sh --bajar        baja el stack de Italia
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PUERTO="${ITALIA_WEB_PORT:-3010}"
P2="${ITALIA_P2_PORT:-8010}"
COMPOSE=(docker compose -p finder-web-italia -f docker-compose.italia.yml)

if [ "${1:-}" = "--bajar" ]; then
  "${COMPOSE[@]}" down
  exit 0
fi

curl -fsS "http://localhost:$P2/api/v1/health" >/dev/null 2>&1 || {
  echo "P2 Italia no responde en :$P2. Levantalo primero:"
  echo "  cd ../paradisofinder-core-italia && ./scripts/levantar_italia.sh --sin-verificar"
  exit 1
}

"${COMPOSE[@]}" up -d --build

echo -n "Espero a P1 Italia en :$PUERTO"
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$PUERTO/api/health" >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 2
done
echo
curl -fsS "http://localhost:$PUERTO/api/health" >/dev/null || {
  echo "P1 Italia no respondió. Logs: ${COMPOSE[*]} logs web"; exit 1; }

echo "Home:       http://localhost:$PUERTO/"
echo "Resultados: http://localhost:$PUERTO/cerca?q=appartamento%20in%20affitto%20a%20milano%20fino%20a%202500%20euro"
