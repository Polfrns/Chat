import { logger, getTenantId, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import { isRokoBridgeModel } from '~/utils/rokoBridge';

/** Shared secret length floor, matching the roko-workspace service. */
const MIN_KEY_LENGTH = 32;
/** The service rejects longer identity fields; failing here keeps the error local. */
const MAX_ID_LENGTH = 256;

export interface RokoWorkspaceConfig {
  /** Service origin + base path, without a trailing slash. */
  baseUrl: string;
  key: string;
}

/** Raw identity the workspace service turns into its per-conversation workspace key. */
export interface RokoWorkspaceIdentity {
  tenantId: string;
  userId: string;
  conversationId: string;
}

export interface RokoWorkspaceUser {
  id?: string;
  tenantId?: string;
  personalization?: { workspace?: boolean };
}

/** `null` when the deployment has not configured the workspace service. */
export function readRokoWorkspaceConfig(
  env: NodeJS.ProcessEnv = process.env,
): RokoWorkspaceConfig | null {
  const rawUrl = env.ROKO_WORKSPACE_URL?.trim();
  const key = env.ROKO_WORKSPACE_KEY ?? '';
  if (!rawUrl) {
    return null;
  }
  if (key.length < MIN_KEY_LENGTH) {
    throw new Error(`ROKO_WORKSPACE_KEY must be at least ${MIN_KEY_LENGTH} characters`);
  }
  const url = new URL(rawUrl);
  return { baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, key };
}

export function rokoWorkspaceMcpUrl(config: RokoWorkspaceConfig): string {
  return `${config.baseUrl}/mcp`;
}

/** Same origin and inside the configured base path; anything else never gets identity. */
export function isRokoWorkspaceUrl(url: string, config: RokoWorkspaceConfig): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  const base = new URL(config.baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  return (
    target.origin === base.origin &&
    (basePath === '' || target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))
  );
}

/**
 * The tenant a workspace belongs to. Run-config users are "safe" projections without
 * tenantId (it must not reach MCP placeholders), so the request's tenant context is the
 * fallback; the system sentinel is never a workspace owner. Without either, the answer
 * depends on the deployment: single-tenant installs legitimately have no tenant (`''`),
 * while `TENANT_ISOLATION_STRICT` makes a missing tenant an error, as upstream's tenant
 * middleware does.
 */
export function resolveWorkspaceTenant(
  user: RokoWorkspaceUser | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const contextTenant = getTenantId();
  const tenantId =
    user?.tenantId ?? (contextTenant !== SYSTEM_TENANT_ID ? contextTenant : undefined);
  if (tenantId != null && tenantId !== '') {
    return tenantId;
  }
  return env.TENANT_ISOLATION_STRICT === 'true' ? undefined : '';
}

export function rokoWorkspaceIdentity({
  user,
  conversationId,
  env = process.env,
}: {
  user?: RokoWorkspaceUser | null;
  conversationId?: string | null;
  env?: NodeJS.ProcessEnv;
}): RokoWorkspaceIdentity | undefined {
  const userId = user?.id;
  const tenantId = resolveWorkspaceTenant(user, env);
  if (tenantId === undefined) {
    logger.warn(
      '[roko-workspace] No tenant for the workspace identity under TENANT_ISOLATION_STRICT; refusing workspace access',
    );
    return undefined;
  }
  if (
    !userId ||
    !conversationId ||
    conversationId === Constants.NEW_CONVO ||
    userId.length > MAX_ID_LENGTH ||
    conversationId.length > MAX_ID_LENGTH ||
    tenantId.length > MAX_ID_LENGTH
  ) {
    return undefined;
  }
  return { tenantId, userId, conversationId };
}

/**
 * Single source of truth for whether a chat turn gets the workspace server and
 * its transfer tools. Bridge models have their own internal workspace.
 */
export function isRokoWorkspaceEnabled({
  user,
  model,
  env = process.env,
}: {
  user?: RokoWorkspaceUser | null;
  model?: string | null;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (isRokoBridgeModel(model) || user?.personalization?.workspace === false) {
    return false;
  }
  try {
    return readRokoWorkspaceConfig(env) !== null;
  } catch (error) {
    // A half-configured deployment (URL without a valid key) must not break every chat.
    logger.error('[Roko workspace] Invalid configuration; workspace disabled:', error);
    return false;
  }
}
