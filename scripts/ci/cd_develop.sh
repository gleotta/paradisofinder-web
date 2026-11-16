#!/bin/bash
# paradisofinder.com — P1: CD local de `develop`.
#
#   guardias rápidas (lint + tsc + build)  →  build + recreate del Docker del
#   usuario (:3000)  →  espera de healthy  →  smoke contra el P2 local
#
# Lo dispara el hook (post-commit / post-merge / pre-push) en segundo plano,
# pero corre igual a mano:  ./scripts/ci/cd_develop.sh
#
# Si las guardias dan rojo, el :3000 NO se toca: se queda con el último
# código que andaba, que es lo que querés si estás mostrando el sistema.

set -u
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
cd "$CI_ROOT"

PIPE=develop

# Un despliegue por vez. Si llega otro commit mientras este corre, se anota
# como pendiente y el que tiene el lock vuelve a correr al terminar (así el
# :3000 termina siempre con el ÚLTIMO commit, no con el primero).
if ! ci_lock "$PIPE"; then
  touch "$STATE_DIR/$PIPE.pending"
  echo "[P1 CD] ya hay un despliegue de develop en curso — encolado"
  exit 0
fi
trap 'ci_unlock "$PIPE"' EXIT

ci_tee_log "$PIPE"

SHA_CORRIDA=""

run_pipeline() {
  local sha short
  sha=$(ci_sha); short=${sha:0:7}
  SHA_CORRIDA="$sha"
  ci_state "$PIPE.last_sha" "$sha"

  echo "=================================================="
  ci_log "CD develop @ ${short} — $(git log -1 --pretty=%s)"
  echo "=================================================="

  if [ "$CD_FAST_TESTS" = "1" ]; then
    ci_log ">>> guardias rápidas (lint + tsc + next build)"
    if ! ci_run ./scripts/ci/guardias_rapidas.sh; then
      ci_log "FAIL: guardias rápidas en rojo."
      ci_log "      El :3000 queda como estaba — no se despliega código roto."
      ci_notify "P1 CD ✗ develop ${short}" "guardias en rojo · el :3000 no se tocó"
      return 1
    fi
  else
    ci_log ">>> guardias rápidas SALTEADAS (CD_FAST_TESTS=0)"
  fi

  ci_log ">>> actualizando el Docker del usuario (:3000)"
  if ! ci_run ./scripts/actualizar_3000.sh; then
    ci_log "FAIL: el :3000 no quedó sano. Log completo arriba."
    ci_notify "P1 CD ✗ develop ${short}" "el :3000 no llegó a healthy o el smoke dio rojo"
    return 1
  fi

  ci_state "$PIPE.last_ok" "$sha"
  ci_log "OK — :3000 corriendo ${short} · http://localhost:3000"
  ci_notify "P1 CD ✓ develop ${short}" ":3000 actualizado y sano"
  return 0
}

RC=0
while :; do
  rm -f "$STATE_DIR/$PIPE.pending"
  run_pipeline || RC=1
  # ¿Se movió la rama mientras corría? Dos señales: el pendiente que dejó
  # el disparo que no consiguió el lock, y el HEAD real (que es la que vale
  # si el `touch` llegó justo antes del `rm` de arriba).
  if [ ! -f "$STATE_DIR/$PIPE.pending" ] && [ "$(ci_sha)" = "$SHA_CORRIDA" ]; then
    break
  fi
  ci_log ">>> la rama se movió mientras corría — se repite con el último commit"
  RC=0
done
exit $RC
