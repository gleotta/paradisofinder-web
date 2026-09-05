#!/bin/sh
# Entrypoint de P1 (docs/DEPLOY_RAILWAY.md).
# Railway monta los volúmenes como root y una imagen no-root no puede escribir
# en ellos. Solución sin correr la app como root: si arrancamos como root,
# dejamos EVENTS_LOG_DIR escribible por `nextjs` y bajamos privilegios con
# su-exec. Si el orquestador ya nos arranca como no-root (RAILWAY_RUN_UID=1001),
# se ejecuta el comando tal cual.
set -eu

if [ "$(id -u)" = "0" ]; then
  if [ -n "${EVENTS_LOG_DIR:-}" ]; then
    if ! mkdir -p "$EVENTS_LOG_DIR" || ! chown -R nextjs:nodejs "$EVENTS_LOG_DIR"; then
      echo "[entrypoint] No pude preparar EVENTS_LOG_DIR=$EVENTS_LOG_DIR; los eventos saldrán por stdout." >&2
    fi
  fi
  exec su-exec nextjs "$@"
fi

exec "$@"
