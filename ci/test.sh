#!/bin/sh
# Uso: sh ci/test.sh [all|seams]
#   all    (por defecto) pruebas Node de scripts/ y todos los Jest de ci/roko-tests.txt.
#   seams  solo los tests de enganche: los ficheros de ci/roko-tests.txt marcados `roko` y, en el
#          resto, los tests cuyo nombre contiene «Roko hook». Es la comprobación rápida tras
#          fusionar una versión de LibreChat.
set -eu
script_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$script_root"
mode=${1:-all}
case "$mode" in all | seams) ;; *) echo "Uso: sh ci/test.sh [all|seams]" >&2; exit 2 ;; esac

export LANGFUSE_TRACING_ENABLED=false
export LANGFUSE_FORCE_FLUSH_ON_DISPOSE=false

if [ "$mode" = all ]; then
  # bridge-parameters.test.cjs uses node:module stripTypeScriptTypes, still experimental in Node 24.
  node --disable-warning=ExperimentalWarning --test scripts/observability.test.cjs scripts/content-privacy.test.cjs \
    scripts/bridge-parameters.test.cjs scripts/roko-surface.test.cjs
  LANGFUSE_TRACING_ENABLED=true node --test scripts/otel-export.test.cjs scripts/interaction-export.test.cjs
fi

# Rutas de ci/roko-tests.txt para un espacio de trabajo. $2 filtra por la marca `roko`:
#   any      todas · only-roko  solo las marcadas · not-roko  solo las no marcadas
paths_for() {
  awk -v ws="$1" -v which="$2" '
    $1 == ws {
      sub(/\r$/, "", $2); sub(/\r$/, "", $3)
      marked = ($3 == "roko")
      if (which == "any" || (which == "only-roko" && marked) || (which == "not-roko" && !marked)) print $2
    }' ci/roko-tests.txt
}

# Ejecuta Jest en un espacio de trabajo con las rutas dadas. Las rutas no llevan espacios: la
# división por palabras es intencionada. Uso: run_jest <espacio> <patrón de nombre|-> <rutas...>
run_jest() {
  workspace=$1
  name_pattern=$2
  shift 2
  if [ "$#" -eq 0 ]; then
    return 0
  fi
  if [ "$name_pattern" = - ]; then
    (cd "$workspace" && "$script_root/node_modules/.bin/jest" --runInBand --coverage=false "$@")
  else
    (cd "$workspace" && "$script_root/node_modules/.bin/jest" --runInBand --coverage=false -t "$name_pattern" "$@")
  fi
}

run_workspace() {
  workspace=$1
  if [ "$mode" = seams ]; then
    # shellcheck disable=SC2046
    run_jest "$workspace" - $(paths_for "$workspace" only-roko)
    # shellcheck disable=SC2046
    run_jest "$workspace" 'Roko hook' $(paths_for "$workspace" not-roko)
  else
    # shellcheck disable=SC2046
    run_jest "$workspace" - $(paths_for "$workspace" any)
  fi
}

run_workspace client
run_workspace packages/data-provider
run_workspace packages/api
run_workspace api
