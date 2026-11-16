#!/bin/bash
# paradisofinder.com — P1: CI/CD de `stage` (staging en Railway).
#
#   ./scripts/ci/cd_stage.sh precheck   guardias rápidas (lo del commit)
#   ./scripts/ci/cd_stage.sh gate       el gate del push: las mismas guardias, BLOQUEANTE
#   ./scripts/ci/cd_stage.sh deploy     artefacto verificado + smoke del stage
#   ./scripts/ci/cd_stage.sh all        gate + deploy
#
# El reparto lo hace el hook:
#   commit en stage  → precheck (feedback nomás)
#   push  a  stage   → gate (si da rojo, el push no sale) y, una vez que el
#                      commit está en origin, deploy en segundo plano.
#
# Quién promueve: la integración de GitHub de Railway (CD_STAGE_DEPLOY=none),
# que mira origin/stage y buildea el Dockerfile sola. Acá no se sube código:
# se verifica el MISMO artefacto en local (worktree limpio del commit
# pusheado) y después se prueba la URL de stage hasta que sirva ESE commit.

set -u
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
cd "$CI_ROOT"

CMD="${1:-all}"
# El commit a promover. El hook pasa el SHA que se está pusheando; a mano,
# el default es la punta de la rama stage (NO el HEAD: podés estar pusheando
# stage parado en otra rama).
SHA_PUSH="${2:-}"

# ---------------------------------------------------------------- precheck --
precheck() {
  ci_log ">>> guardias rápidas (stage)"
  if ci_run ./scripts/ci/guardias_rapidas.sh; then
    ci_notify "P1 CI ✓ stage" "guardias rápidas en verde"
    return 0
  fi
  ci_notify "P1 CI ✗ stage" "guardias rápidas en rojo"
  return 1
}

# -------------------------------------------------------------------- gate --
# La vara de P1 (handoff de P2, 05/09): build limpio. Corre sobre el árbol de
# trabajo, que es lo único que un pre-push puede probar.
gate() {
  if [ -n "$SHA_PUSH" ] && [ "$SHA_PUSH" != "$(ci_sha)" ]; then
    ci_log "OJO: el gate corre sobre el ÁRBOL DE TRABAJO ($(ci_sha | cut -c1-7)),"
    ci_log "     no sobre el commit que estás pusheando (${SHA_PUSH:0:7})."
  fi
  ci_log ">>> gate de stage: lint + tsc + next build"
  ci_run ./scripts/ci/guardias_rapidas.sh
}

# ------------------------------------------------------------------ deploy --
deploy() {
  local sha short
  sha="$SHA_PUSH"
  [ -z "$sha" ] && sha=$(git -C "$CI_ROOT" rev-parse "$CD_STAGE_BRANCH" 2>/dev/null)
  [ -z "$sha" ] && sha=$(ci_sha)
  short=${sha:0:7}

  ci_load_env_local   # STAGE_P2_API_KEY, RAILWAY_TOKEN… (secretos, fuera del repo)

  # Se verifica y se prueba lo que está en origin, no lo que está en tu disco:
  # esperamos a que el push efectivamente haya llegado.
  ci_log ">>> esperando que origin/${CD_STAGE_BRANCH} tenga ${short}"
  if [ "$CD_DRY_RUN" = "1" ]; then
    ci_log "    [ensayo] no se espera a origin"
  elif ! ci_wait_until 180 bash -c \
      "git -C '$CI_ROOT' ls-remote origin refs/heads/${CD_STAGE_BRANCH} | grep -q '^${sha}'"; then
    ci_log "ERROR: origin/${CD_STAGE_BRANCH} no tiene ${short} (¿el push falló?). No se sigue."
    ci_notify "P1 CD ✗ stage ${short}" "el commit no llegó a origin — sin deploy"
    return 1
  fi

  if [ "$CD_STAGE_VERIFY_ARTIFACT" = "1" ]; then
    ci_log ">>> verificando el artefacto Docker de ${short} (contenedor aislado :${CD_VERIFY_PORT})"
    if ! VERIFY_PORT="$CD_VERIFY_PORT" ci_run ./scripts/deploy_verify.sh --ref "$sha"; then
      ci_log "FAIL: el artefacto no pasó la verificación. Railway lo está buildeando igual:"
      ci_log "      revisá el log de acá antes de mirar el de Railway."
      ci_notify "P1 CD ✗ stage ${short}" "el artefacto Docker no verifica"
      return 1
    fi
  fi

  case "$CD_STAGE_DEPLOY" in
    none)
      ci_log ">>> promueve Railway desde GitHub — el pipeline verifica el resultado"
      smoke_remoto "$short" 1
      return $? ;;
    railway) ;;
    *) ci_log "ERROR: CD_STAGE_DEPLOY desconocido: ${CD_STAGE_DEPLOY}"; return 1 ;;
  esac

  railway_up "$sha" || return 1
  smoke_remoto "$short" 0
}

# Alternativa: promover con el CLI (CD_STAGE_DEPLOY=railway). Igual que en P2:
# sube un worktree limpio del commit pusheado. Necesita `railway login` (o
# RAILWAY_TOKEN en .env.local) y RAILWAY_PROJECT_ID en .ci/config.
railway_up() {
  local sha="$1" short="${1:0:7}" rc=0 wt

  command -v railway >/dev/null 2>&1 || {
    ci_log "ERROR: falta el CLI de Railway (brew install railway)"; return 1; }
  if ! railway whoami >/dev/null 2>&1; then
    ci_log "ERROR: Railway sin sesión."
    ci_log "       Corré 'railway login' una vez, o poné RAILWAY_TOKEN=... en .env.local"
    return 1
  fi
  if [ -z "$RAILWAY_PROJECT_ID" ]; then
    ci_log "ERROR: falta RAILWAY_PROJECT_ID (el deploy sale de un worktree sin linkear)."
    ci_log "       Ponelo en .ci/config — 'railway status --json' te lo dice."
    return 1
  fi

  wt="$CI_ROOT/.ci/worktrees/stage-${short}"
  rm -rf "$wt"; git -C "$CI_ROOT" worktree prune
  git -C "$CI_ROOT" worktree add --detach "$wt" "$sha" >/dev/null 2>&1 || {
    ci_log "ERROR: no se pudo crear el worktree en ${wt}"; return 1; }

  local args=(up --ci --project "$RAILWAY_PROJECT_ID"
              --environment "$RAILWAY_ENVIRONMENT"
              --message "stage ${short}")
  [ -n "$RAILWAY_SERVICE" ] && args+=(--service "$RAILWAY_SERVICE")

  ci_log ">>> railway ${args[*]}"
  if [ "$CD_DRY_RUN" = "1" ]; then
    ci_log "    [ensayo] no se promueve"
  else
    ( cd "$wt" && railway "${args[@]}" ) || rc=1
  fi

  git -C "$CI_ROOT" worktree remove --force "$wt" >/dev/null 2>&1

  if [ "$rc" != "0" ]; then
    ci_log "FAIL: la promoción a Railway falló."
    ci_notify "P1 CD ✗ stage ${short}" "railway up falló"
    return 1
  fi
  ci_state "stage.last_ok" "$sha"
  ci_log "OK — ${short} promovido al entorno ${RAILWAY_ENVIRONMENT}"
  return 0
}

# Un deploy que buildea no es un deploy que anda: se confirma contra la URL.
# Con pin=1 el smoke espera a que /api/health reporte la versión del commit
# (Railway inyecta RAILWAY_GIT_COMMIT_SHA): mientras siga sirviendo el deploy
# anterior, se sigue esperando. Y falla ante degradación silenciosa (mocks).
smoke_remoto() {  # smoke_remoto <short> <pin-version 0|1>
  local short="$1" pin="$2" expect=""
  if [ -z "$STAGE_BASE_URL" ]; then
    ci_log ">>> sin STAGE_BASE_URL en .ci/config — no hay smoke remoto (poné la URL del stage de P1 para tenerlo)"
    ci_notify "P1 CD ⚠ stage ${short}" "sin STAGE_BASE_URL: nadie verificó el deploy"
    return 0
  fi
  [ "$pin" = "1" ] && [ "$CD_STAGE_PIN_VERSION" = "1" ] && expect="$short"
  ci_log ">>> smoke remoto contra ${STAGE_BASE_URL}${expect:+ — esperando la versión ${expect}} (hasta ${STAGE_SMOKE_DEADLINE}s: Railway está buildeando)"
  [ -n "$STAGE_P2_BASE_URL" ] && ci_log "    cruce de total_matches con ${STAGE_P2_BASE_URL}${STAGE_P2_API_KEY:+ (con key)}"
  if [ "$CD_DRY_RUN" = "1" ]; then
    ci_log "    [ensayo] no se ejecuta el smoke"
    return 0
  fi
  if SMOKE_DEADLINE="$STAGE_SMOKE_DEADLINE" SMOKE_EXPECT_VERSION="$expect" \
     SMOKE_QUERY="$STAGE_SMOKE_QUERY" \
     SMOKE_P2_BASE_URL="$STAGE_P2_BASE_URL" SMOKE_P2_API_KEY="$STAGE_P2_API_KEY" \
     node scripts/ci/smoke.mjs "$STAGE_BASE_URL"; then
    ci_state "stage.last_ok" "$(git rev-parse "$short" 2>/dev/null || echo "$short")"
    ci_notify "P1 CD ✓ stage ${short}" "stage responde, habla con P2 y busca"
    return 0
  fi
  ci_log "FAIL: el deploy quedó arriba pero el smoke da rojo."
  ci_notify "P1 CD ✗ stage ${short}" "smoke remoto en rojo"
  return 1
}

case "$CMD" in
  precheck) ci_tee_log stage_precheck; precheck ;;
  gate)     ci_tee_log stage_gate;     gate ;;
  deploy)   ci_tee_log stage_deploy;   deploy ;;
  all)      ci_tee_log stage;          gate && deploy ;;
  *) echo "uso: $0 [precheck|gate|deploy|all] [sha]"; exit 2 ;;
esac
