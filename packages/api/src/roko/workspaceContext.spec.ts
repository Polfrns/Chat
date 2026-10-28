import { createHmac } from 'node:crypto';
import {
  currentRokoWorkspaceIdentity,
  rokoWorkspaceHeaders,
  runWithRokoWorkspaceContext,
  signRokoWorkspaceContext,
} from './workspaceContext';
import type { RokoWorkspaceIdentity } from './workspace';

const env = {
  ROKO_WORKSPACE_URL: 'http://roko-workspace:8080/workspace',
  ROKO_WORKSPACE_KEY: 'w'.repeat(40),
  OBSERVABILITY_SESSION_SECRET: 't'.repeat(40),
} as NodeJS.ProcessEnv;
const identityA: RokoWorkspaceIdentity = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  conversationId: 'conversation-a',
};
const identityB: RokoWorkspaceIdentity = {
  tenantId: 'tenant-b',
  userId: 'user-b',
  conversationId: 'conversation-b',
};

function decodeContext(headers: Record<string, string>) {
  return JSON.parse(Buffer.from(headers['x-roko-context'], 'base64url').toString('utf8'));
}

describe('Roko workspace request context', () => {
  it('signs a fresh timestamp and the exact context format per call', () => {
    const first = signRokoWorkspaceContext(identityA, env.ROKO_WORKSPACE_KEY!, env, 1000);
    const second = signRokoWorkspaceContext(identityA, env.ROKO_WORKSPACE_KEY!, env, 2000);
    const payload = decodeContext(first);
    const contextKey = createHmac('sha256', env.ROKO_WORKSPACE_KEY!)
      .update('roko-workspace/context/v1')
      .digest();

    expect(payload).toMatchObject({
      v: 1,
      aud: 'roko-workspace',
      ...identityA,
      timestamp: 1000,
      telemetry: { sessionId: expect.any(String), userId: expect.any(String) },
    });
    expect(first['x-roko-signature']).toBe(
      createHmac('sha256', contextKey).update(first['x-roko-context']).digest('hex'),
    );
    expect(second['x-roko-context']).not.toBe(first['x-roko-context']);
    expect(decodeContext(second).timestamp).toBe(2000);
  });

  it('strips every incoming x-roko header and signs only the configured origin and path', () => {
    runWithRokoWorkspaceContext(identityA, () => {
      const workspace = rokoWorkspaceHeaders(
        'http://roko-workspace:8080/workspace/mcp/tools',
        {
          Authorization: 'Bearer configured',
          'X-Roko-Fake': 'forged',
          'x-roko-context': 'forged-context',
          'x-roko-signature': 'forged-signature',
        },
        env,
        3000,
      );
      const otherOrigin = rokoWorkspaceHeaders(
        'http://other-service:8080/mcp',
        { 'x-roko-fake': 'forged', 'x-roko-context': 'forged' },
        env,
        3000,
      );
      const otherPath = rokoWorkspaceHeaders(
        'http://roko-workspace:8080/elsewhere',
        { 'x-roko-fake': 'forged' },
        env,
        3000,
      );

      expect(workspace.Authorization).toBe('Bearer configured');
      expect(decodeContext(workspace)).toMatchObject(identityA);
      expect(workspace['x-roko-fake']).toBeUndefined();
      expect(otherOrigin).toEqual({});
      expect(otherPath).toEqual({});
    });
  });

  it('leaves the request unsigned when no async context exists', () => {
    runWithRokoWorkspaceContext(identityA, () => undefined);
    const headers = rokoWorkspaceHeaders(
      'http://roko-workspace:8080/workspace/mcp',
      { Authorization: 'Bearer configured', 'x-roko-context': 'forged' },
      env,
      4000,
    );

    expect(headers).toEqual({ Authorization: 'Bearer configured' });
    expect(currentRokoWorkspaceIdentity()).toBeUndefined();
  });

  it('keeps concurrent identities isolated on a shared connection context', async () => {
    const sign = async (identity: RokoWorkspaceIdentity) =>
      runWithRokoWorkspaceContext(identity, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return decodeContext(
          rokoWorkspaceHeaders('http://roko-workspace:8080/workspace/mcp', {}, env, Date.now()),
        );
      });

    const [first, second] = await Promise.all([sign(identityA), sign(identityB)]);

    expect(first).toMatchObject(identityA);
    expect(second).toMatchObject(identityB);
  });
});
