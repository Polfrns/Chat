import crypto from 'node:crypto';
import {
  generatePkce,
  parsePastedCode,
  buildAuthorizeUrl,
  resolveAccessTokenExpiry,
} from './oauth';
import { CLIENT_ID, REDIRECT_URI, DEFAULT_ACCESS_TOKEN_TTL_SECONDS } from './constants';

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('claude/oauth', () => {
  describe('generatePkce', () => {
    it('produces a challenge that is the S256 hash of the verifier', () => {
      const { verifier, challenge } = generatePkce();
      const expected = base64url(crypto.createHash('sha256').update(verifier).digest());
      expect(challenge).toBe(expected);
    });

    it('produces a unique verifier each call', () => {
      expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('targets claude.ai with the required PKCE and client params', () => {
      const url = new URL(buildAuthorizeUrl({ challenge: 'abc', state: 'xyz' }));
      const params = url.searchParams;
      expect(url.origin + url.pathname).toBe('https://claude.ai/oauth/authorize');
      expect(params.get('response_type')).toBe('code');
      expect(params.get('client_id')).toBe(CLIENT_ID);
      expect(params.get('redirect_uri')).toBe(REDIRECT_URI);
      expect(params.get('code_challenge')).toBe('abc');
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(params.get('state')).toBe('xyz');
      expect(params.get('scope')).toContain('user:inference');
    });
  });

  describe('parsePastedCode', () => {
    it('splits a `code#state` value', () => {
      expect(parsePastedCode('  the-code#the-state  ')).toEqual({
        code: 'the-code',
        state: 'the-state',
      });
    });

    it('accepts a bare code with no state', () => {
      expect(parsePastedCode('just-a-code')).toEqual({ code: 'just-a-code', state: undefined });
    });
  });

  describe('resolveAccessTokenExpiry', () => {
    const now = 1_000_000_000_000;

    it('uses expires_in when present', () => {
      expect(
        resolveAccessTokenExpiry({ access_token: 'sk-ant-oat01-x', expires_in: 120 }, now),
      ).toBe(now + 120 * 1000);
    });

    it('falls back to the default ttl when expires_in is missing', () => {
      expect(resolveAccessTokenExpiry({ access_token: 'sk-ant-oat01-x' }, now)).toBe(
        now + DEFAULT_ACCESS_TOKEN_TTL_SECONDS * 1000,
      );
    });
  });
});
