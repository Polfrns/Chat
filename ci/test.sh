#!/bin/sh
# Uso: sh ci/test.sh [all|seams]
#   all    (por defecto) pruebas Node de scripts/ y todos los Jest de ci/roko-tests.txt.
#   seams  solo los tests de enganche: los de ci/roko-tests.txt cuyo nombre empieza por
#          «Roko hook». Es la comprobación rápida tras fusionar una versión de LibreChat.
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

# Ejecuta, dentro de un espacio de trabajo, los tests que ci/roko-tests.txt le asigna.
run_workspace() {
  workspace=$1
  # Las rutas no llevan espacios: la división por palabras es intencionada.
  # shellcheck disable=SC2046
  set -- $(awk -v ws="$workspace" '$1 == ws { sub(/\r$/, "", $2); print $2 }' ci/roko-tests.txt)
  if [ "$#" -eq 0 ]; then
    return 0
  fi
  if [ "$mode" = seams ]; then
    (cd "$workspace" && "$script_root/node_modules/.bin/jest" --runInBand --coverage=false -t 'Roko hook' "$@")
  else
    (cd "$workspace" && "$script_root/node_modules/.bin/jest" --runInBand --coverage=false "$@")
  fi
}

run_workspace client
run_workspace packages/api
run_workspace api
