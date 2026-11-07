import fs from 'node:fs';
import path from 'node:path';

/** Written at the top of every file `scripts/patch-observability.cjs` modifies. */
export const OBSERVABILITY_PATCH_MARKER = 'ROKO_OBSERVABILITY_V088';

/** The files the patch rewrites, relative to `@librechat/agents/dist/<cjs|esm>`. */
const PATCHED_FILES = ['langfuse', 'langfuseToolOutputTracing', 'run'] as const;

function isTruthy(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

/**
 * Whether this deployment can export traces. Trace privacy (content masking, pseudonymous sessions)
 * is applied by a patch to `@librechat/agents`, so it only matters when something is exported.
 */
export function isTraceExportConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isTruthy(env.OTEL_SDK_DISABLED)) {
    return false;
  }
  if (isTruthy(env.OTEL_TRACING_ENABLED)) {
    return true;
  }
  return (
    env.LANGFUSE_TRACING_ENABLED?.trim().toLowerCase() !== 'false' &&
    Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY)
  );
}

/** Patched files that do not carry the marker. Empty when the patch is fully applied. */
export function findUnpatchedFiles(agentsDistDir: string): string[] {
  const missing: string[] = [];
  for (const [dir, ext] of [
    ['cjs', 'cjs'],
    ['esm', 'mjs'],
  ]) {
    for (const name of PATCHED_FILES) {
      const file = path.join(agentsDistDir, dir, `${name}.${ext}`);
      let head = '';
      try {
        head = fs.readFileSync(file, 'utf8').slice(0, 200);
      } catch {
        // An unreadable file counts as unpatched.
      }
      if (!head.includes(OBSERVABILITY_PATCH_MARKER)) {
        missing.push(file);
      }
    }
  }
  return missing;
}

export function resolveAgentsDistDir(): string {
  return path.resolve(path.dirname(require.resolve('@librechat/agents')), '../..', 'dist');
}

/**
 * Fails startup when traces can be exported but the privacy patch is not installed: without it,
 * prompts, tool output and raw identifiers would leave the system. When nothing is exported the
 * absence is only logged by the caller through the return value.
 *
 * @returns the unpatched files (empty when fine) so the caller can log a warning when export is off.
 */
export function assertObservabilityPatch(
  options: { env?: NodeJS.ProcessEnv; agentsDistDir?: string } = {},
): string[] {
  const env = options.env ?? process.env;
  const missing = findUnpatchedFiles(options.agentsDistDir ?? resolveAgentsDistDir());
  if (missing.length > 0 && isTraceExportConfigured(env)) {
    throw new Error(
      'Trace export is enabled but the observability privacy patch is not applied to @librechat/agents ' +
        `(missing in ${missing.length} file(s)). Run "npm run observability:patch" after "npm ci".`,
    );
  }
  return missing;
}
