import { createClaudeFetch } from './fetch';
import * as tokens from './tokens';
import { OAUTH_BETA, CLAUDE_CODE_SYSTEM_PROMPT } from './constants';

jest.mock('./tokens');

const mockedGetValidAccessToken = tokens.getValidAccessToken as jest.MockedFunction<
  typeof tokens.getValidAccessToken
>;

function lastInit(fetchSpy: jest.SpyInstance): RequestInit {
  return fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1] as RequestInit;
}

describe('claude/fetch', () => {
  beforeEach(() => mockedGetValidAccessToken.mockResolvedValue('sk-ant-oat01-token'));
  afterEach(() => jest.restoreAllMocks());

  it('strips x-api-key and injects the OAuth bearer + beta header', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));

    const claudeFetch = createClaudeFetch();
    await claudeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'placeholder', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    const headers = lastInit(fetchSpy).headers as Headers;
    expect(headers.has('x-api-key')).toBe(false);
    expect(headers.get('authorization')).toBe('Bearer sk-ant-oat01-token');
    const beta = headers.get('anthropic-beta') ?? '';
    expect(beta).toContain(OAUTH_BETA);
    /** Existing betas are preserved (unioned, not overwritten). */
    expect(beta).toContain('prompt-caching-2024-07-31');
  });

  it('prepends the Claude Code identity as the first system block (string system)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));

    const claudeFetch = createClaudeFetch();
    await claudeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    const body = JSON.parse(lastInit(fetchSpy).body as string);
    expect(body.system[0]).toEqual({ type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT });
    expect(body.system[1]).toEqual({ type: 'text', text: 'You are a helpful assistant.' });
  });

  it('prepends the identity block when system is an array, without duplicating it', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const claudeFetch = createClaudeFetch();

    await claudeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        system: [{ type: 'text', text: 'Existing.' }],
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    let body = JSON.parse(lastInit(fetchSpy).body as string);
    expect(body.system[0].text).toBe(CLAUDE_CODE_SYSTEM_PROMPT);
    expect(body.system).toHaveLength(2);

    /** Re-running on an already-prefixed body must not double the identity block. */
    await claudeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    body = JSON.parse(lastInit(fetchSpy).body as string);
    expect(
      body.system.filter((b: { text: string }) => b.text === CLAUDE_CODE_SYSTEM_PROMPT),
    ).toHaveLength(1);
  });

  it('sets the identity block as the sole system block when none is provided', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const claudeFetch = createClaudeFetch();
    await claudeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const body = JSON.parse(lastInit(fetchSpy).body as string);
    expect(body.system).toEqual([{ type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT }]);
  });
});
