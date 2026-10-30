import { createHmac } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RokoWorkspaceIdentity } from './workspace';
import { isRokoWorkspaceUrl, readRokoWorkspaceConfig } from './workspace';

export const ROKO_CONTEXT_HEADER = 'x-roko-context';
export const ROKO_SIGNATURE_HEADER = 'x-roko-signature';
const CONTEXT_AUDIENCE = 'roko-workspace';
const CONTEXT_VERSION = 1;
/** Domain separation: the shared key never signs contexts directly. */
const CONTEXT_KEY_LABEL = 'roko-workspace/context/v1';

interface TelemetryIdentity {
  sessionId: string;
  userId: string;
}

export interface RokoWorkspaceContextPayload extends RokoWorkspaceIdentity {
  v: typeof CONTEXT_VERSION;
  aud: typeof CONTEXT_AUDIENCE;
  telemetry?: TelemetryIdentity;
  timestamp: number;
}

export interface RokoWorkspaceSignedHeaders {
  [ROKO_CONTEXT_HEADER]: string;
  [ROKO_SIGNATURE_HEADER]: string;
}

type SessionIdentity = (
  userId: string,
  conversationId: string,
  env: NodeJS.ProcessEnv,
  tenantId: string,
) => Partial<TelemetryIdentity>;

/**
 * The MCP connection is cached per user and shared by all of their
 * conversations, so identity must come from the async context of the call that
 * issues each HTTP request, never from connection state. `Symbol.for` keeps one
 * store even if this module is bundled more than once.
 */
const storeKey = Symbol.for('roko.workspace.context.v1');
const globalStore = globalThis as typeof globalThis & {
  [storeKey]?: AsyncLocalStorage<RokoWorkspaceIdentity | undefined>;
};
const storage = (globalStore[storeKey] ??= new AsyncLocalStorage<
  RokoWorkspaceIdentity | undefined
>());

/** Runs `action` with exactly this identity; `undefined` clears any outer one. */
export function runWithRokoWorkspaceContext<T>(
  identity: RokoWorkspaceIdentity | undefined,
  action: () => T,
): T {
  return storage.run(identity, action);
}

export function currentRokoWorkspaceIdentity(): RokoWorkspaceIdentity | undefined {
  return storage.getStore();
}

function telemetryFor(
  identity: RokoWorkspaceIdentity,
  env: NodeJS.ProcessEnv,
): TelemetryIdentity | undefined {
  // Same pseudonyms Roko and the bridge export to Langfuse, so traces share sessions.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sessionIdentity } = require('../../../../config/observability/context.cjs') as {
    sessionIdentity: SessionIdentity;
  };
  const telemetry = sessionIdentity(
    identity.userId,
    identity.conversationId,
    env,
    identity.tenantId,
  );
  return telemetry.sessionId && telemetry.userId
    ? { sessionId: telemetry.sessionId, userId: telemetry.userId }
    : undefined;
}

export function signRokoWorkspaceContext(
  identity: RokoWorkspaceIdentity,
  key: string,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): RokoWorkspaceSignedHeaders {
  const telemetry = telemetryFor(identity, env);
  const payload: RokoWorkspaceContextPayload = {
    v: CONTEXT_VERSION,
    aud: CONTEXT_AUDIENCE,
    tenantId: identity.tenantId,
    userId: identity.userId,
    conversationId: identity.conversationId,
    ...(telemetry ? { telemetry } : {}),
    timestamp: now,
  };
  const context = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const contextKey = createHmac('sha256', key).update(CONTEXT_KEY_LABEL).digest();
  return {
    [ROKO_CONTEXT_HEADER]: context,
    [ROKO_SIGNATURE_HEADER]: createHmac('sha256', contextKey).update(context).digest('hex'),
  };
}

/**
 * Outbound header filter for every MCP HTTP request. Identity headers are always
 * stripped (a user-configured server must not forge or receive them) and only
 * re-added, freshly signed, for the configured workspace URL when the calling
 * async context carries an identity. Without one the request goes unsigned and
 * the service answers 401 rather than guessing a conversation.
 */
export function rokoWorkspaceHeaders(
  url: string,
  headers: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Record<string, string> {
  const safe = Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const lower = name.toLowerCase();
      return !lower.startsWith('x-roko-');
    }),
  );
  const identity = storage.getStore();
  if (!identity) {
    return safe;
  }
  let config: ReturnType<typeof readRokoWorkspaceConfig>;
  try {
    config = readRokoWorkspaceConfig(env);
  } catch {
    // This filter runs for every MCP server; a bad workspace key must not break the
    // others. `resolveRokoMcpServer` reports it and never injects the server.
    return safe;
  }
  if (!config || !isRokoWorkspaceUrl(url, config)) {
    return safe;
  }
  return { ...safe, ...signRokoWorkspaceContext(identity, config.key, env, now) };
}
