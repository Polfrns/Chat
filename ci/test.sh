#!/bin/sh
set -eu
script_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$script_root"
export LANGFUSE_TRACING_ENABLED=false
export LANGFUSE_FORCE_FLUSH_ON_DISPOSE=false
node --test scripts/observability.test.cjs scripts/content-privacy.test.cjs scripts/bridge-parameters.test.cjs
LANGFUSE_TRACING_ENABLED=true node --test scripts/otel-export.test.cjs scripts/interaction-export.test.cjs
(cd client && ../node_modules/.bin/jest --runInBand --coverage=false src/components/Chat/Messages/Content/__tests__/bridgeToolRecords.test.ts src/components/Chat/Messages/Content/__tests__/BridgeToolReasoning.test.tsx \
  src/components/Skills/__tests__/SkillDeletionRequests.spec.tsx src/hooks/Messages/__tests__/useSubmitMessage.spec.ts)
(cd packages/api && ../../node_modules/.bin/jest --runInBand --coverage=false src/utils/rokoBridge.spec.ts src/telemetry/sdk.spec.ts \
  src/skills/__tests__/deletionRequests.test.ts)
(cd api && ../node_modules/.bin/jest --runInBand --coverage=false server/utils/__tests__/runMiddlewareChain.spec.js \
  app/clients/tools/structured/specs/SkillLibrary.spec.js)
