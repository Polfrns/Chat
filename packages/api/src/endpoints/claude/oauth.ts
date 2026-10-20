import crypto from 'node:crypto';
import {
  CLIENT_ID,
  TOKEN_URL,
  OAUTH_SCOPE,
  REDIRECT_URI,
  AUTHORIZE_URL,
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
} from './constants';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export interface ClaudeTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generates a PKCE verifier/challenge pair (S256), per RFC 7636. */
export function generatePkce(): PkcePair {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Builds the authorization URL the user opens to sign in with their Claude account. */
export function buildAuthorizeUrl({
  challenge,
  state,
}: {
  challenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    code: 'true',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Splits the value pasted from the redirect page. Claude's manual flow returns
 * the code as `code#state`; accept either that or a bare code.
 */
export function parsePastedCode(pasted: string): { code: string; state?: string } {
  const trimmed = pasted.trim();
  const [code, state] = trimmed.split('#');
  return { code, state: state || undefined };
}

async function postToken(body: Record<string, unknown>): Promise<ClaudeTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Claude token endpoint returned ${response.status}: ${detail}`);
  }
  return (await response.json()) as ClaudeTokenResponse;
}

/** Exchanges an authorization code for tokens. */
export function exchangeCode({
  code,
  state,
  verifier,
}: {
  code: string;
  state?: string;
  verifier: string;
}): Promise<ClaudeTokenResponse> {
  return postToken({
    grant_type: 'authorization_code',
    code,
    state,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
}

/** Mints a new access token from a stored refresh token. */
export function refreshAccessToken(refreshToken: string): Promise<ClaudeTokenResponse> {
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
}

/**
 * Resolves the access-token expiry (epoch ms) from `expires_in`, with a
 * conservative default. Claude OAuth access tokens are opaque (`sk-ant-oat01-…`).
 */
export function resolveAccessTokenExpiry(tokens: ClaudeTokenResponse, now: number): number {
  if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) {
    return now + tokens.expires_in * 1000;
  }
  return now + DEFAULT_ACCESS_TOKEN_TTL_SECONDS * 1000;
}
