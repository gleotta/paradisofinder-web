#!/bin/bash
# paradisofinder.com — P1: qué hizo el CI/CD local y cómo va lo que está corriendo.
#
#   ./scripts/ci/cd_status.sh        resumen + últimas líneas del log
#   ./scripts/ci/cd_status.sh -f     seguir en vivo el log más reciente
#   ./scripts/ci/cd_status.sh -l     listar los logs

set -u
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
cd "$CI_ROOT"

ULTIMO=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)

case "${1:-}" in
  -f) [ -n "$ULTIMO" ] || { echo "todavía no corrió nada"; exit 0; }
      echo ">>> siguiendo ${ULTIMO}"; exec tail -f "$ULTIMO" ;;
  -l) ls -lt "$LOG_DIR"/*.log 2>/dev/null | head -20; exit 0 ;;
esac

echo "=================================================="
echo "  CI/CD local — $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo "=================================================="
echo "  hooks: $(git config core.hooksPath 2>/dev/null || echo 'SIN ENCHUFAR — ./scripts/ci/install_hooks.sh')"

for p in develop stage; do
  ok=$(cat "$STATE_DIR/$p.last_ok" 2>/dev/null || echo "")
  if [ -n "$ok" ]; then
    printf "  %-8s último OK: %s  %s\n" "$p" "${ok:0:7}" \
      "$(git log -1 --pretty=%s "$ok" 2>/dev/null)"
  else
    printf "  %-8s sin despliegues OK todavía\n" "$p"
  fi
  [ -d "$STATE_DIR/$p.lock" ] && printf "  %-8s CORRIENDO AHORA\n" "$p"
done

echo ""
echo "  Docker del usuario (:3000): $(docker inspect paradisofinder-web --format '{{.State.Health.Status}}' 2>/dev/null || echo 'no está')"
echo "  stage de P1 (Railway):      ${STAGE_BASE_URL:-sin STAGE_BASE_URL en .ci/config}"

if [ -n "$ULTIMO" ]; then
  echo ""
  echo ">>> ${ULTIMO} (últimas 15)"
  tail -15 "$ULTIMO" | sed 's/^/    /'
fi
