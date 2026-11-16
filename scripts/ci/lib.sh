#!/bin/bash
# paradisofinder.com — P1: helpers comunes del CI/CD local. Se SOURCEA, no se
# ejecuta. Copiado del esqueleto de P2 (finder-core, 05/09/2026) con el mismo
# contrato: todo script del pipeline empieza con
#   . "$(dirname "$0")/lib.sh"
# y con eso ya tiene CI_ROOT, la config, los logs y el lock.

CI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Los hooks corren con GIT_DIR / GIT_INDEX_FILE apuntando al commit en curso:
# heredarlos en un proceso de fondo hace que `git` opere sobre un índice que
# ya no existe (y en post-commit, sobre uno a medio escribir). Se limpian una
# sola vez, acá.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_QUARANTINE_PATH

LOG_DIR="$CI_ROOT/.ci/logs"
STATE_DIR="$CI_ROOT/.ci/state"
mkdir -p "$LOG_DIR" "$STATE_DIR"

ci_ts()     { date +%Y%m%d_%H%M%S; }
ci_branch() { git -C "$CI_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null; }
ci_sha()    { git -C "$CI_ROOT" rev-parse HEAD 2>/dev/null; }
ci_log()    { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# Notificación de macOS: el pipeline corre en segundo plano, así que el
# veredicto tiene que ir a buscarte a vos.
ci_notify() {  # ci_notify <titulo> <mensaje>
  [ "${CD_NOTIFY:-1}" = "1" ] || return 0
  command -v osascript >/dev/null 2>&1 || return 0
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

# `timeout` no existe en macOS: espera con deadline propio.
ci_wait_until() {  # ci_wait_until <segundos> <comando...>
  local deadline=$(( $(date +%s) + $1 )); shift
  until "$@" >/dev/null 2>&1; do
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep 2
  done
  return 0
}

# Ensayo. Con CD_DRY_RUN=1 el pipeline recorre todos sus pasos y los ANUNCIA
# en vez de ejecutarlos: no toca el Docker, no corre las guardias y no
# promueve nada. Es la forma de probar el cableado de los hooks sin efectos.
ci_run() {
  if [ "${CD_DRY_RUN:-0}" = "1" ]; then
    ci_log "    [ensayo] no se ejecuta: $*"
    return 0
  fi
  "$@"
}

# El estado (qué SHA quedó desplegado) no se escribe en un ensayo: si no,
# un CD_DRY_RUN=1 dejaría dicho que el :3000 corre algo que nunca desplegó.
ci_state() {  # ci_state <archivo> <valor>
  [ "${CD_DRY_RUN:-0}" = "1" ] && return 0
  echo "$2" > "$STATE_DIR/$1"
}

# Lock por pipeline. `mkdir` es atómico y `flock` no existe en macOS. El PID
# queda adentro para distinguir un despliegue en curso de un lock huérfano
# (kill -9, reinicio a mitad de una corrida): sin esto, un cuelgue trababa el
# CD para siempre y había que borrar .ci/state a mano.
ci_lock() {  # ci_lock <nombre>
  local d="$STATE_DIR/$1.lock" pid
  if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; return 0; fi
  pid=$(cat "$d/pid" 2>/dev/null || echo "")
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    ci_log "(lock huérfano del pid ${pid:-?} — se descarta)"
    rm -rf "$d"
    mkdir "$d" 2>/dev/null && { echo $$ > "$d/pid"; return 0; }
  fi
  return 1
}
ci_unlock() { rm -rf "$STATE_DIR/$1.lock" 2>/dev/null || true; }

# Manda todo (stdout y stderr) a un log Y a la terminal. El log es lo que
# lee `cd_status.sh` cuando el pipeline corrió en segundo plano.
ci_tee_log() {  # ci_tee_log <nombre-pipeline>
  # El PID va en el nombre porque dos corridas pueden arrancar en el mismo
  # segundo (commit + push seguidos) y `tee -a` las mezclaría en un archivo.
  local log="$LOG_DIR/$(ci_ts)_$1_$$.log"
  echo "$log" > "$STATE_DIR/$1.last_log"
  exec > >(tee -a "$log") 2>&1
}

# Secretos de Railway/stage: viven en .env.local (gitignored), NUNCA en el
# repo. Se exportan solo las claves RAILWAY_* y STAGE_*. (Next también lee
# .env.local, pero son variables del server y ninguna es NEXT_PUBLIC_.)
ci_load_env_local() {
  local f="$CI_ROOT/.env.local"
  [ -f "$f" ] || return 0
  set -a
  . <(grep -E '^(RAILWAY|STAGE)_[A-Z0-9_]+=' "$f")
  set +a
}

. "$CI_ROOT/scripts/ci/config.sh"
