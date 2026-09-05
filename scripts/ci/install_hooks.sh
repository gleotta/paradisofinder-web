#!/bin/bash
# paradisofinder.com — P1: enchufa (o desenchufa) el CI/CD local.
#
#   ./scripts/ci/install_hooks.sh              instalar
#   ./scripts/ci/install_hooks.sh --uninstall  volver a los hooks de siempre
#
# No copia nada a .git/hooks: apunta core.hooksPath a scripts/git-hooks, que
# SÍ está versionado. Así el hook que corre es el que está en el repo — se
# revisa en el diff y no se desincroniza entre máquinas.

set -u
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
cd "$CI_ROOT"

if [ "${1:-}" = "--uninstall" ]; then
  git config --unset core.hooksPath 2>/dev/null
  echo "CI/CD local DESENCHUFADO (core.hooksPath sin valor)."
  echo "Los scripts siguen: ./scripts/ci/cd_develop.sh y ./scripts/ci/cd_stage.sh corren a mano."
  exit 0
fi

chmod +x scripts/git-hooks/* scripts/ci/*.sh scripts/*.sh
git config core.hooksPath scripts/git-hooks

# Plantilla de config por máquina (gitignored). Solo la primera vez: si ya
# la editaste, no se toca.
if [ ! -f "$CI_ROOT/.ci/config" ]; then
  mkdir -p "$CI_ROOT/.ci"
  cat > "$CI_ROOT/.ci/config" <<'CFG'
# paradisofinder.com — P1: config del CI/CD de ESTA máquina (gitignored).
# Los SECRETOS no van acá: STAGE_P2_API_KEY y RAILWAY_TOKEN van en .env.local.

# --- Smoke remoto post-deploy (push a stage) ---
# La URL pública del stage de P1 en Railway (Settings → Networking → Generate Domain).
# Sin esto el pipeline no verifica el deploy: solo Railway dice "buildeó".
# STAGE_BASE_URL="https://paradisofinder-web-staging.up.railway.app"
# El P2 con el que se cruza total_matches (default: el stage de P2 del handoff del 05/09).
# STAGE_P2_BASE_URL="https://paradisofinder-core-staging.up.railway.app"
# STAGE_SMOKE_QUERY="casas en rawson"
# STAGE_SMOKE_DEADLINE=900

# --- Railway (solo con CD_STAGE_DEPLOY=railway) ---
# 'railway status --json' te da el project id una vez que estés linkeado.
# RAILWAY_PROJECT_ID=""
# RAILWAY_ENVIRONMENT="stage"
# RAILWAY_SERVICE="paradisofinder-web"

# --- Interruptores ---
# CD_FAST_TESTS=1              # 0 = develop no corre lint/tsc/build antes de rebuildear
# CD_STAGE_GATE_BLOCKING=1     # 0 = el gate de stage no frena el push
# CD_STAGE_VERIFY_ARTIFACT=1   # 0 = no verificar la imagen Docker tras el push
# CD_VERIFY_PORT=3002          # puerto del contenedor de verificación (nunca 3000)
# CD_STAGE_DEPLOY=none         # railway = promover con el CLI en vez de la integración de GitHub
# CD_STAGE_PIN_VERSION=1       # 0 = el smoke no espera a que stage sirva el commit pusheado
# CD_NOTIFY=1                  # 0 = sin notificaciones de macOS
CFG
  echo "  (creado .ci/config — la config de esta máquina)"
fi

echo "=================================================="
echo "  CI/CD local ENCHUFADO"
echo "=================================================="
echo "  core.hooksPath = $(git config core.hooksPath)"
echo ""
echo "  commit/merge/push en '${CD_DEVELOP_BRANCH}'"
echo "     → lint + tsc + build, y rebuild del Docker del :3000 (en segundo plano)"
echo "  commit en '${CD_STAGE_BRANCH}'"
echo "     → lint + tsc + build"
echo "  push a '${CD_STAGE_BRANCH}'"
echo "     → gate lint + tsc + build (bloquea el push si da rojo)"
echo "     → artefacto Docker verificado en :${CD_VERIFY_PORT} + smoke del stage de Railway"
echo ""
for b in "$CD_DEVELOP_BRANCH" "$CD_STAGE_BRANCH"; do
  git show-ref --verify --quiet "refs/heads/$b" \
    && echo "  rama ${b}: existe" \
    || echo "  rama ${b}: NO existe todavía — 'git branch ${b}'"
done
[ -n "$STAGE_BASE_URL" ] \
  && echo "  stage de P1: ${STAGE_BASE_URL}" \
  || echo "  stage de P1: SIN STAGE_BASE_URL — ver docs/CI_CD.md (.ci/config)"
echo ""
echo "  Estado y logs:  ./scripts/ci/cd_status.sh"
