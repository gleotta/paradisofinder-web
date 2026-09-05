#!/bin/bash
# paradisofinder.com — P1: configuración del CI/CD local (valores por defecto).
#
# Precedencia:  .ci/config  >  entorno  >  estos defaults.
# `.ci/config` es gitignored: ahí va lo de cada máquina (URL del stage de P1,
# ids de Railway). Los SECRETOS van en `.env.local`, no acá.

[ -f "$CI_ROOT/.ci/config" ] && . "$CI_ROOT/.ci/config"

: "${CD_DEVELOP_BRANCH:=develop}"
: "${CD_STAGE_BRANCH:=stage}"

# develop: guardias rápidas (lint + tsc + next build, ~1 min) antes de tocar
# el Docker del :3000.
: "${CD_FAST_TESTS:=1}"

# stage: el gate (las mismas guardias) BLOQUEA el push si da rojo
# (`git push --no-verify` lo saltea).
: "${CD_STAGE_GATE_BLOCKING:=1}"
# stage: verificar el artefacto Docker (contenedor aislado en CD_VERIFY_PORT,
# contra el P2 local) después del push. Es lo que Railway va a buildear.
: "${CD_STAGE_VERIFY_ARTIFACT:=1}"
: "${CD_VERIFY_PORT:=3002}"
# stage: quién promueve. `none` = la integración de GitHub de Railway (mira
# origin/stage y buildea sola; el pipeline solo verifica el resultado).
# `railway` = el pipeline sube un worktree limpio con el CLI (ver docs/CI_CD.md).
: "${CD_STAGE_DEPLOY:=none}"
# stage: el smoke remoto espera a que /api/health reporte la versión del
# commit pusheado (Railway inyecta RAILWAY_GIT_COMMIT_SHA). Así "stage
# responde" quiere decir "stage corre ESTE commit" y no el deploy anterior.
# 0 si Railway no inyecta el sha (p. ej. promoviendo con el CLI).
: "${CD_STAGE_PIN_VERSION:=1}"

: "${CD_NOTIFY:=1}"

# Ensayo: recorre el pipeline sin ejecutar los pasos que tienen efecto.
: "${CD_DRY_RUN:=0}"

# --- Railway (entorno de staging) — solo con CD_STAGE_DEPLOY=railway ---------
# El deploy sale de un worktree limpio del commit pusheado, que no está
# linkeado: por eso el project id es OBLIGATORIO para promover con el CLI.
: "${RAILWAY_PROJECT_ID:=}"
: "${RAILWAY_ENVIRONMENT:=stage}"
: "${RAILWAY_SERVICE:=}"

# --- Smoke remoto post-deploy -----------------------------------------------
# La URL pública del stage de P1 en Railway. Sin esto no hay smoke remoto: te
# queda un "Railway dice que buildeó" en vez de un "anda".
: "${STAGE_BASE_URL:=}"
# El P2 contra el que el smoke cruza `total_matches` (misma consulta por P1 y
# por P2: si los números difieren, P1 no está hablando con ese P2). Es la URL
# PÚBLICA del stage de P2: el smoke corre desde esta máquina, fuera de la red
# privada de Railway (el P2_BASE_URL de P1 en Railway es el privado,
# http://paradisofinder-core.railway.internal:8000). La key va en .env.local
# (STAGE_P2_API_KEY).
: "${STAGE_P2_BASE_URL:=https://paradisofinder-core-staging.up.railway.app}"
: "${STAGE_P2_API_KEY:=}"
: "${STAGE_SMOKE_QUERY:=casas en rawson}"
# Cuánto esperar a que stage conteste con la versión nueva. Promoviendo desde
# GitHub, el reloj arranca ANTES del build de Railway (npm ci + next build,
# 3-5 min) y del healthcheck.
: "${STAGE_SMOKE_DEADLINE:=900}"
