#!/bin/bash
# paradisofinder.com — P1: BUILD → DEPLOY → VERIFY del artefacto Docker (un
# comando, un veredicto). Adaptado de scripts/deploy_verify.sh de P2.
#
# Verifica LA IMAGEN, no el código: que lo que Railway va a buildear con este
# mismo Dockerfile arranque, corra como no-root, llegue a P2 de verdad
# (P2_MODE=live), sirva la home con el hardening puesto, busque con datos
# reales y no lleve secretos ni peso muerto adentro. El código lo verifican
# las guardias (scripts/ci/guardias_rapidas.sh).
#
# Levanta un contenedor AISLADO (paradisofinder-web-verify, puerto 3002 por
# defecto) contra el P2 del Docker local (:8000). NUNCA toca el contenedor
# del usuario en el 3000.
#
# Uso:
#   ./scripts/deploy_verify.sh               # árbol de trabajo: build + deploy + verify + teardown
#   ./scripts/deploy_verify.sh --ref <sha>   # un worktree LIMPIO de ese commit (lo que ve Railway)
#   ./scripts/deploy_verify.sh --keep        # deja el contenedor arriba para revisarlo
#   ./scripts/deploy_verify.sh --no-build    # reusa la imagen ya construida
#   VERIFY_PORT=3003 ./scripts/deploy_verify.sh

set -u -o pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

NAME="paradisofinder-web-verify"
IMAGE="paradisofinder-web:verify"
PORT="${VERIFY_PORT:-3002}"
BASE="http://localhost:${PORT}"
P2_LOCAL="${VERIFY_P2_BASE_URL:-http://localhost:8000}"
TS=$(date +%Y%m%d_%H%M%S)
REPORT_DIR=".ci/reports"
REPORT="${REPORT_DIR}/deploy_verify_${TS}.md"
KEEP=0
BUILD=1
REF=""

while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --no-build) BUILD=0 ;;
    --ref) shift; REF="${1:-}"; [ -n "$REF" ] || { echo "--ref necesita un commit"; exit 2; } ;;
    *) echo "Flag desconocida: $1"; exit 2 ;;
  esac
  shift
done

mkdir -p "$REPORT_DIR"

# La versión que el artefacto va a reportar en /api/health (APP_VERSION): el
# commit que se empaqueta. Así el smoke ata la imagen al commit.
SHA=$(git rev-parse "${REF:-HEAD}" 2>/dev/null) || { echo "ERROR: commit desconocido: ${REF}"; exit 2; }
SHORT=${SHA:0:7}
CONTEXT="$ROOT"
WORKTREE=""

# P2_API_KEY del P2 local, como lo hace docker compose (vacía = auth apagada).
P2_KEY=""
[ -f .env ] && P2_KEY=$(grep -E '^P2_API_KEY=' .env | tail -1 | cut -d= -f2- | tr -d '"' || true)

declare -a NAMES RESULTS
FAIL=0

run_step() {
  local name="$1"; shift
  echo ""
  echo ">>> ${name}"
  if "$@"; then
    NAMES+=("$name"); RESULTS+=("PASS")
  else
    NAMES+=("$name"); RESULTS+=("FAIL")
    FAIL=1
  fi
}

# `timeout` no existe en macOS: espera con deadline propio.
wait_until() {  # wait_until <segundos> <comando...>
  local deadline=$(( $(date +%s) + $1 )); shift
  until "$@" >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then return 1; fi
    sleep 2
  done
}

teardown() {
  if [ -n "$WORKTREE" ]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
    git worktree prune >/dev/null 2>&1
  fi
  if [ "$KEEP" = "1" ]; then
    echo ""
    echo "  Contenedor EN PIE (--keep): ${BASE}"
    echo "  Bajarlo con: docker rm -f ${NAME}"
    return
  fi
  echo ""
  echo ">>> teardown del contenedor de verificación"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap teardown EXIT

# =============================================================================
# 0. Preflight — condiciones sin las cuales la verificación no significa nada
# =============================================================================
preflight() {
  docker info >/dev/null 2>&1 || { echo "ERROR: Docker no está corriendo."; return 1; }

  # El artefacto corre con P2_MODE=live: sin el P2 real no hay nada que verificar.
  if ! curl -sf -m 10 "${P2_LOCAL}/api/v1/health" | grep -q '"status":"ok"'; then
    echo "ERROR: el P2 local (${P2_LOCAL}) no responde. Sin P2 el artefacto no busca"
    echo "       (P2_MODE=live) y la verificación no vale. docs/DOCKER.md §2."
    return 1
  fi

  if [ "$PORT" = "3000" ]; then
    echo "ERROR: VERIFY_PORT=3000 es el Docker del usuario. Elegí otro."
    return 1
  fi
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: el puerto ${PORT} ya está ocupado. Usá VERIFY_PORT=<otro>."
    return 1
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true   # restos de una corrida anterior con --keep

  if [ -n "$REF" ]; then
    WORKTREE="$ROOT/.ci/worktrees/verify-${SHORT}"
    rm -rf "$WORKTREE"; git worktree prune >/dev/null 2>&1
    git worktree add --detach "$WORKTREE" "$SHA" >/dev/null 2>&1 || {
      echo "ERROR: no se pudo crear el worktree de ${SHORT} en ${WORKTREE}"; return 1; }
    CONTEXT="$WORKTREE"
    echo "contexto de build: worktree limpio de ${SHORT} (sin .env.local ni cambios sin commitear)"
  else
    echo "contexto de build: el árbol de trabajo (${SHORT}$(git diff --quiet HEAD 2>/dev/null || echo ' + cambios sin commitear'))"
  fi
  echo "preflight ok — Docker vivo, P2 local arriba, puerto ${PORT} libre"
}
run_step "preflight" preflight
[ "$FAIL" = "1" ] && { echo "Preflight falló: no tiene sentido seguir."; exit 1; }

# =============================================================================
# 1. Build de la imagen — el mismo Dockerfile que buildea Railway
# =============================================================================
build() {
  if [ "$BUILD" = "0" ]; then
    docker image inspect "$IMAGE" >/dev/null 2>&1 || {
      echo "ERROR: --no-build pero no existe ${IMAGE}."; return 1; }
    echo "build salteado (--no-build): se reusa ${IMAGE}"
    return 0
  fi
  docker build -t "$IMAGE" "$CONTEXT" 2>&1 | tail -12 || return 1
  echo "imagen construida: ${IMAGE}"
}
run_step "build de la imagen" build

# =============================================================================
# 2. Auditoría de la IMAGEN — antes de desplegarla
# =============================================================================
auditar_imagen() {
  local ok=0
  local en_imagen="docker run --rm --entrypoint sh $IMAGE -c"

  # (0) Control POSITIVO: probar que realmente podemos mirar adentro. Sin
  #     esto, un `docker run` que falla por cualquier motivo se leería como
  #     "no hay secretos" — un falso verde en el chequeo de seguridad.
  if $en_imagen "test -f /app/server.js" 2>/dev/null; then
    echo "  OK control positivo: se puede inspeccionar el filesystem de la imagen"
  else
    echo "  FALLO: no se puede inspeccionar la imagen — los chequeos de abajo NO valen"
    return 1
  fi

  # (a) Secretos: .dockerignore excluye .env* — verificarlo en el artefacto real.
  for secreto in /app/.env /app/.env.local /app/.env.production; do
    if $en_imagen "test -e $secreto" 2>/dev/null; then
      echo "  FALLO: la imagen CONTIENE ${secreto} — las keys se inyectan por env, nunca se hornean"
      ok=1
    fi
  done
  [ "$ok" = "0" ] && echo "  OK sin .env* adentro"

  # (b) Peso muerto: docs/scripts/devDependencies no son runtime (standalone traza solo lo que usa).
  for gordo in /app/docs /app/scripts /app/node_modules/typescript /app/node_modules/eslint /app/src; do
    if $en_imagen "test -e $gordo" 2>/dev/null; then
      echo "  FALLO: la imagen incluye ${gordo} (no debería: .dockerignore / output standalone)"
      ok=1
    fi
  done
  echo "  OK sin docs/scripts/src ni devDependencies adentro"

  # (c) Tamaño: ~318 MB (node:24-alpine + standalone). Si sube mucho, algo entró al contexto.
  local tope="${VERIFY_MAX_IMAGE_MB:-600}" humano mb
  humano=$(docker images "$IMAGE" --format '{{.Size}}' | head -1)
  mb=$(node -e 'const m=/([0-9.]+)\s*([KMGT]?B)/.exec(process.argv[1]);const u={B:1e-6,KB:1e-3,MB:1,GB:1e3,TB:1e6};console.log(m?Math.round(parseFloat(m[1])*u[m[2]]):-1)' "$humano")
  if [ "$mb" -lt 0 ]; then
    echo "  FALLO: no se pudo leer el tamaño de la imagen ('${humano}')"; ok=1
  elif [ "$mb" -ge "$tope" ]; then
    echo "  FALLO: la imagen pesa ${humano} (tope ${tope} MB) — ¿entró node_modules completo o .next/cache?"; ok=1
  else
    echo "  OK tamaño ${humano} (tope ${tope} MB)"
  fi
  return $ok
}
run_step "auditoría de la imagen" auditar_imagen

# =============================================================================
# 3. Deploy aislado — mismas variables que Railway, contra el P2 local
# =============================================================================
deploy() {
  docker run -d --name "$NAME" -p "${PORT}:3000" \
    -e P2_BASE_URL=http://host.docker.internal:8000 \
    -e P2_API_KEY="$P2_KEY" \
    -e P2_MODE=live \
    -e APP_VERSION="$SHORT" \
    --add-host host.docker.internal:host-gateway \
    "$IMAGE" >/dev/null || return 1
  echo "contenedor desplegado en ${BASE} (APP_VERSION=${SHORT})"
}

# =============================================================================
# 4. Arranque: el contenedor tiene que llegar a `healthy` solo (HEALTHCHECK
#    propio de la imagen: wget a /api/health cada 30 s, start-period 15 s)
# =============================================================================
esperar_healthy() {
  local espera="${VERIFY_BOOT_TIMEOUT:-120}"
  if wait_until "$espera" bash -c \
      "[ \"\$(docker inspect $NAME --format '{{.State.Health.Status}}' 2>/dev/null)\" = healthy ]"; then
    echo "healthy en menos de ${espera}s"
  else
    echo "ERROR: no llegó a healthy en ${espera}s. Últimos logs:"
    docker logs --tail 40 "$NAME" 2>&1 | sed 's/^/    /'
    return 1
  fi
  # No-root: el entrypoint arranca como root (para el volumen) y baja a nextjs.
  local user
  user=$(docker exec "$NAME" ps -o user,args 2>/dev/null | grep -E 'next-server|server.js' | awk '{print $1}' | head -1)
  if [ "$user" = "nextjs" ]; then
    echo "el server corre como 'nextjs' (no-root)"
  else
    echo "ERROR: el server corre como '${user:-?}', se esperaba 'nextjs' (docker-entrypoint.sh / su-exec)"
    return 1
  fi
}

# =============================================================================
# 5. Verificación funcional: el smoke común, atado a la versión empaquetada
# =============================================================================
verificar() {
  SMOKE_EXPECT_VERSION="$SHORT" SMOKE_P2_BASE_URL="$P2_LOCAL" SMOKE_P2_API_KEY="$P2_KEY" \
    node scripts/ci/smoke.mjs "$BASE"
}

run_step "deploy del artefacto" deploy
ultimo() { echo "${RESULTS[$(( ${#RESULTS[@]} - 1 ))]}"; }

if [ "$(ultimo)" = "PASS" ]; then
  run_step "arranque (healthy solo, no-root)" esperar_healthy
  if [ "$(ultimo)" = "PASS" ]; then
    run_step "verificación funcional (smoke)" verificar
  else
    NAMES+=("verificación funcional (smoke)"); RESULTS+=("SKIP"); FAIL=1
  fi
else
  NAMES+=("arranque (healthy solo, no-root)"); RESULTS+=("SKIP")
  NAMES+=("verificación funcional (smoke)"); RESULTS+=("SKIP")
  FAIL=1
fi

# =============================================================================
# Veredicto
# =============================================================================
{
  echo "# Deploy verify — ${TS}"
  echo ""
  echo "Artefacto: \`${IMAGE}\` · commit ${SHORT}$([ -n "$REF" ] && echo ' (worktree limpio)' || echo ' (árbol de trabajo)') · ${BASE}"
  echo ""
  for i in "${!NAMES[@]}"; do
    icon="✅"
    [ "${RESULTS[$i]}" = "FAIL" ] && icon="❌"
    [ "${RESULTS[$i]}" = "SKIP" ] && icon="⏭️"
    echo "- ${icon} ${NAMES[$i]}: ${RESULTS[$i]}"
  done
  echo ""
  if [ "$FAIL" = "0" ]; then echo "**VEREDICTO: PASS**"; else echo "**VEREDICTO: FAIL**"; fi
} > "$REPORT"

echo ""
echo "=================================================="
for i in "${!NAMES[@]}"; do
  printf "  %-36s %s\n" "${NAMES[$i]}" "${RESULTS[$i]}"
done
echo "  Reporte: ${REPORT}"
if [ "$FAIL" = "0" ]; then echo "  VEREDICTO: PASS"; else echo "  VEREDICTO: FAIL"; fi
exit $FAIL
