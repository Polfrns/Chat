import type { Dispatcher } from 'undici';
import { getProxyDispatcher } from '~/utils/proxy';
import { getValidAccessToken } from './tokens';
import { OAUTH_BETA, CLAUDE_CODE_BETA, CLAUDE_CODE_SYSTEM_PROMPT } from './constants';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** undici's fetch accepts a `dispatcher` on the init object; the DOM type omits it. */
type ClaudeRequestInit = RequestInit & { dispatcher?: Dispatcher };

interface SystemBlock {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

function unionBeta(existing: string | null): string {
  const values = (existing ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const beta of [CLAUDE_CODE_BETA, OAUTH_BETA]) {
    if (!values.includes(beta)) {
      values.push(beta);
    }
  }
  return values.join(',');
}

/**
 * Ensures the Claude Code identity is the first `system` block. Anthropic
 * rejects subscription-authenticated requests whose first system block is not
 * exactly this string (on its own block), so the user's real system prompt is
 * preserved as subsequent block(s).
 */
function prependClaudeCodePrompt(system: unknown): SystemBlock[] {
  const identity: SystemBlock = { type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT };

  if (system == null) {
    return [identity];
  }
  if (typeof system === 'string') {
    return system.trim() ? [identity, { type: 'text', text: system }] : [identity];
  }
  if (Array.isArray(system)) {
    const first = system[0] as { text?: unknown } | undefined;
    if (first && typeof first.text === 'string' && first.text === CLAUDE_CODE_SYSTEM_PROMPT) {
      return system as SystemBlock[];
    }
    return [identity, ...(system as SystemBlock[])];
  }
  return [identity];
}

function injectSystemPrompt(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string') {
    return body;
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.messages)) {
      parsed.system = prependClaudeCodePrompt(parsed.system);
      return JSON.stringify(parsed);
    }
  } catch {
    /* Not a JSON body (or not a Messages request) — pass through unchanged. */
  }
  return body;
}

/**
 * Builds a `fetch` for the native Anthropic client that authenticates with a
 * Claude subscription instead of an API key. Per request it: removes the
 * SDK's `x-api-key`, injects a fresh OAuth bearer token, unions the required
 * `oauth-2025-04-20` beta into `anthropic-beta`, and prepends the Claude Code
 * system block to the request body.
 */
export function createClaudeFetch(proxy?: string | null): Fetch {
  const dispatcher = getProxyDispatcher(proxy);

  return async (input, init = {}) => {
    const accessToken = await getValidAccessToken();

    const headers = new Headers(init.headers);
    headers.delete('x-api-key');
    headers.set('authorization', `Bearer ${accessToken}`);
    headers.set('anthropic-beta', unionBeta(headers.get('anthropic-beta')));
    if (!headers.has('anthropic-version')) {
      headers.set('anthropic-version', '2023-06-01');
    }
    headers.set('x-app', 'cli');

    const finalInit: ClaudeRequestInit = {
      ...init,
      headers,
      body: injectSystemPrompt(init.body),
    };
    if (dispatcher) {
      finalInit.dispatcher = dispatcher;
    }

    return fetch(input as string | URL, finalInit);
  };
}
