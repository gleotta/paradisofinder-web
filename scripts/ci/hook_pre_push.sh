#!/bin/bash
# paradisofinder.com — P1: lo que corre ANTES de que salga un push.
#
#   push a develop → dispara el CD local si ese commit todavía no se desplegó
#                    (no bloquea: ya lo cubrió el post-commit en el caso normal)
#   push a stage   → gate BLOQUEANTE (lint + tsc + build). Si da rojo el push
#                    no sale. Si pasa, en segundo plano: espera a que el commit
#                    esté en origin, verifica el artefacto Docker y hace el
#                    smoke contra la URL de stage cuando Railway lo promueve.
#
# Escotilla: `git push --no-verify` saltea todo esto.

set -u
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

DEV_SHA=""
STAGE_SHA=""
NULO="0000000000000000000000000000000000000000"

while read -r _local_ref local_sha remote_ref _remote_sha; do
  [ -z "${remote_ref:-}" ] && continue
  [ "$local_sha" = "$NULO" ] && continue          # borrado de rama
  case "$remote_ref" in
    "refs/heads/$CD_DEVELOP_BRANCH") DEV_SHA="$local_sha" ;;
    "refs/heads/$CD_STAGE_BRANCH")   STAGE_SHA="$local_sha" ;;
  esac
done

if [ -n "$DEV_SHA" ]; then
  YA=$(cat "$STATE_DIR/develop.last_sha" 2>/dev/null || echo "")
  if [ "$DEV_SHA" = "$YA" ]; then
    echo "[P1 CD] push a ${CD_DEVELOP_BRANCH}: ${DEV_SHA:0:7} ya está desplegado en el :3000"
  else
    echo "[P1 CD] push a ${CD_DEVELOP_BRANCH} → actualizando el :3000 en segundo plano"
    nohup "$CI_ROOT/scripts/ci/cd_develop.sh" >/dev/null 2>&1 &
  fi
fi

if [ -n "$STAGE_SHA" ]; then
  if [ "$CD_STAGE_GATE_BLOCKING" != "1" ]; then
    echo "[P1 CD] push a ${CD_STAGE_BRANCH}: gate NO bloqueante (CD_STAGE_GATE_BLOCKING=0)"
    nohup "$CI_ROOT/scripts/ci/cd_stage.sh" all "$STAGE_SHA" >/dev/null 2>&1 &
    exit 0
  fi

  echo ""
  echo "=================================================="
  echo "  push a ${CD_STAGE_BRANCH} — GATE (lint + tsc + next build, ~1 min)"
  echo "  Si da rojo, el push no sale. Saltearlo: git push --no-verify"
  echo "=================================================="
  if ! "$CI_ROOT/scripts/ci/cd_stage.sh" gate "$STAGE_SHA"; then
    echo ""
    echo "[P1 CD] GATE EN ROJO — push CANCELADO. Nada llegó a origin ni a Railway."
    exit 1
  fi
  echo ""
  echo "[P1 CD] gate PASS → el push sale; artefacto + smoke del stage siguen en segundo plano"
  echo "[P1 CD]   ./scripts/ci/cd_status.sh -f   para ver cómo va"
  nohup "$CI_ROOT/scripts/ci/cd_stage.sh" deploy "$STAGE_SHA" >/dev/null 2>&1 &
fi

exit 0
