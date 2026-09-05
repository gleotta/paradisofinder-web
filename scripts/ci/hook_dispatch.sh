#!/bin/bash
# paradisofinder.com — P1: qué dispara un commit/merge, según la rama en la
# que caiga. Lo invocan los hooks post-commit y post-merge. No bloquea nunca:
# el pipeline se va a segundo plano y avisa por notificación de macOS.

set -u
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

EVENTO="${1:-commit}"
BRANCH=$(ci_branch)

case "$BRANCH" in
  "$CD_DEVELOP_BRANCH")
    echo "[P1 CD] ${EVENTO} en ${BRANCH} → guardias + rebuild del Docker del :3000 en segundo plano"
    echo "[P1 CD]   ./scripts/ci/cd_status.sh -f   para ver cómo va"
    nohup "$CI_ROOT/scripts/ci/cd_develop.sh" >/dev/null 2>&1 &
    ;;
  "$CD_STAGE_BRANCH")
    echo "[P1 CD] ${EVENTO} en ${BRANCH} → guardias rápidas en segundo plano"
    echo "[P1 CD]   el gate bloqueante y la verificación del deploy salen con el push"
    nohup "$CI_ROOT/scripts/ci/cd_stage.sh" precheck >/dev/null 2>&1 &
    ;;
esac
exit 0
