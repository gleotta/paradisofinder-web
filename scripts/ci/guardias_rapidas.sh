#!/bin/bash
# paradisofinder.com — P1: guardias RÁPIDAS (las de cada commit en develop y
# el gate de stage). El equivalente de los 397 tests de P2: P1 no tiene suite,
# su vara es que el código compile limpio.
#
#   lint (eslint)  →  typecheck (tsc --noEmit)  →  next build
#
# Del más barato al más caro, y se corta en el primero que falla. ~1 min en
# total; el build es la mayor parte. Corre sobre el árbol de trabajo. Next 16
# aísla el build de producción (.next/) del dev server (.next/dev/): pueden
# convivir con un `npm run dev` abierto.

set -u
cd "$(dirname "$0")/../.."

[ -d node_modules ] || { echo "ERROR: falta node_modules — corré 'npm ci' primero."; exit 1; }

t0=$(date +%s)
paso() { printf '>>> %s\n' "$1"; }

paso "lint (eslint)"
npm run --silent lint || { echo "FAIL: lint en rojo"; exit 1; }

paso "typecheck (tsc --noEmit)"
npx tsc --noEmit || { echo "FAIL: errores de tipos"; exit 1; }

paso "next build"
npm run --silent build || { echo "FAIL: next build en rojo"; exit 1; }

echo "guardias rápidas: OK ($(( $(date +%s) - t0 ))s)"
