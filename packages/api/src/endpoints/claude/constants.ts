/**
 * Constants for the native Claude (Pro/Max subscription) provider.
 *
 * These mirror the Claude Code CLI's OAuth behavior so a Claude subscription can
 * be used as an LLM provider against the Anthropic Messages API, instead of an
 * API key. Endpoints, client id, and the required beta are overridable via
 * environment variables for testing and resilience against upstream changes.
 */

const { CLAUDE_CLIENT_ID } = process.env;

/** Public OAuth client id used by the Claude Code CLI (PKCE, no secret). */
export const CLIENT_ID: string = CLAUDE_CLIENT_ID || '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

export const AUTHORIZE_URL: string = 'https://claude.ai/oauth/authorize';
export const TOKEN_URL: string = 'https://console.anthropic.com/v1/oauth/token';

/**
 * Manual (copy-paste) redirect target. After sign-in, Anthropic shows a page
 * with a `code#state` string the user pastes back into the login CLI — no
 * loopback server required, so it works on headless hosts.
 */
export const REDIRECT_URI: string = 'https://console.anthropic.com/oauth/code/callback';
export const OAUTH_SCOPE: string = 'org:create_api_key user:profile user:inference';

/** Required beta to route a request through the subscription billing path. */
export const OAUTH_BETA: string = 'oauth-2025-04-20';
/** Sent by the real Claude Code client alongside the OAuth beta. */
export const CLAUDE_CODE_BETA: string = 'claude-code-20250219';

/**
 * The Anthropic Messages API rejects subscription-authenticated requests (HTTP
 * 400) unless the FIRST `system` block is exactly this string, on its own block.
 * The user's real system prompt follows in subsequent blocks.
 */
export const CLAUDE_CODE_SYSTEM_PROMPT: string =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * Token storage (app-level, single shared subscription) under the all-zero
 * system user id. Access and refresh tokens live in separate `Token` docs
 * (mirrors the MCP OAuth storage): the short-lived access doc may be removed by
 * the TTL index while the long-lived refresh doc survives to re-mint.
 */
export const ACCESS_TOKEN_TYPE: string = 'claude_oauth';
export const REFRESH_TOKEN_TYPE: string = 'claude_oauth_refresh';
export const ACCESS_TOKEN_IDENTIFIER: string = 'claude:oauth';
export const REFRESH_TOKEN_IDENTIFIER: string = 'claude:oauth:refresh';

/** Refresh proactively when within this window of access-token expiry. */
export const REFRESH_LEEWAY_MS: number = 5 * 60 * 1000;

/** Fallback access-token lifetime when the response omits `expires_in`. */
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS: number = 60 * 60;

/** Long-lived horizon for the refresh-token doc so the TTL index won't drop it. */
export const REFRESH_TOKEN_TTL_SECONDS: number = 60 * 24 * 60 * 60;
