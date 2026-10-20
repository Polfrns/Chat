import mongoose from 'mongoose';
import { logger, encryptV2, decryptV2, createTokenMethods } from '@librechat/data-schemas';
import type { TokenMethods } from '@librechat/data-schemas';
import { CONSTANTS } from '~/mcp/enum';
import { refreshAccessToken, resolveAccessTokenExpiry } from './oauth';
import type { ClaudeTokenResponse } from './oauth';
import {
  REFRESH_LEEWAY_MS,
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
  ACCESS_TOKEN_IDENTIFIER,
  REFRESH_TOKEN_IDENTIFIER,
  REFRESH_TOKEN_TTL_SECONDS,
} from './constants';

/** Credentials are app-level (single Claude subscription) under the system user. */
const USER_ID = CONSTANTS.SYSTEM_USER_ID;

/** Thrown when there are no usable credentials and a re-login is required. */
export class ClaudeAuthError extends Error {
  constructor(message = 'Claude is not authenticated. Run `npm run claude:login` to sign in.') {
    super(message);
    this.name = 'ClaudeAuthError';
  }
}

let injectedTokenMethods: TokenMethods | null = null;

/** Test seam: inject token methods instead of building them from mongoose. */
export function setClaudeTokenMethods(methods: TokenMethods | null): void {
  injectedTokenMethods = methods;
}

function getTokenMethods(): TokenMethods {
  if (injectedTokenMethods) {
    return injectedTokenMethods;
  }
  if (!mongoose.models.Token) {
    throw new ClaudeAuthError('Claude token store unavailable: database not initialized.');
  }
  return createTokenMethods(mongoose);
}

async function upsertToken(
  methods: TokenMethods,
  query: { type: string; identifier: string },
  data: { token: string; expiresIn: number },
): Promise<void> {
  const existing = await methods.findToken({ userId: USER_ID, ...query });
  const payload = { userId: USER_ID, ...query, ...data };
  if (existing) {
    await methods.updateToken({ userId: USER_ID, ...query }, payload);
  } else {
    await methods.createToken(payload);
  }
}

/**
 * Persists Claude OAuth tokens as two encrypted `Token` docs (access + refresh),
 * mirroring the MCP OAuth storage. The refresh doc keeps a long TTL so the
 * short-lived access doc can expire without losing the ability to re-mint.
 */
export async function saveCredentials(
  tokens: ClaudeTokenResponse,
  now: number = Date.now(),
): Promise<void> {
  const methods = getTokenMethods();

  const accessExpiry = resolveAccessTokenExpiry(tokens, now);
  const accessExpiresIn = Math.max(1, Math.floor((accessExpiry - now) / 1000));

  await upsertToken(
    methods,
    { type: ACCESS_TOKEN_TYPE, identifier: ACCESS_TOKEN_IDENTIFIER },
    { token: await encryptV2(tokens.access_token), expiresIn: accessExpiresIn },
  );

  if (tokens.refresh_token) {
    await upsertToken(
      methods,
      { type: REFRESH_TOKEN_TYPE, identifier: REFRESH_TOKEN_IDENTIFIER },
      { token: await encryptV2(tokens.refresh_token), expiresIn: REFRESH_TOKEN_TTL_SECONDS },
    );
  }
}

/** Removes all stored Claude credentials (logout). */
export async function clearCredentials(): Promise<void> {
  const methods = getTokenMethods();
  await methods.deleteTokens({ userId: USER_ID, identifier: ACCESS_TOKEN_IDENTIFIER });
  await methods.deleteTokens({ userId: USER_ID, identifier: REFRESH_TOKEN_IDENTIFIER });
}

/** Module-level de-dupe so concurrent requests trigger at most one refresh. */
let refreshInFlight: Promise<string> | null = null;

async function performRefresh(methods: TokenMethods, now: number): Promise<string> {
  const refreshDoc = await methods.findToken({
    userId: USER_ID,
    type: REFRESH_TOKEN_TYPE,
    identifier: REFRESH_TOKEN_IDENTIFIER,
  });
  if (!refreshDoc) {
    throw new ClaudeAuthError();
  }

  const refreshToken = await decryptV2(refreshDoc.token);
  logger.info('[Claude] Refreshing access token');
  const tokens = await refreshAccessToken(refreshToken);
  await saveCredentials(tokens, now);
  return tokens.access_token;
}

/**
 * Returns a non-expired Claude access token, refreshing via the stored refresh
 * token when the access token is missing or within the leeway window of expiry.
 * Concurrent calls share a single in-flight refresh.
 *
 * @throws {ClaudeAuthError} when no credentials exist and a re-login is required.
 */
export async function getValidAccessToken(now: number = Date.now()): Promise<string> {
  const methods = getTokenMethods();

  const accessDoc = await methods.findToken({
    userId: USER_ID,
    type: ACCESS_TOKEN_TYPE,
    identifier: ACCESS_TOKEN_IDENTIFIER,
  });

  const expiresAt = accessDoc?.expiresAt ? accessDoc.expiresAt.getTime() : 0;
  const isUsable = accessDoc != null && expiresAt - now > REFRESH_LEEWAY_MS;
  if (isUsable) {
    return decryptV2(accessDoc.token);
  }

  if (!refreshInFlight) {
    refreshInFlight = performRefresh(methods, now).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
