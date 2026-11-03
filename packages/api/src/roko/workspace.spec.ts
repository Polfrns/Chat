import { tenantStorage, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import { isRokoWorkspaceEnabled, rokoWorkspaceIdentity } from './workspace';

const configured: NodeJS.ProcessEnv = {
  ROKO_WORKSPACE_URL: 'http://roko-workspace:8080',
  ROKO_WORKSPACE_KEY: 'k'.repeat(32),
};

describe('Roko workspace MCP selection', () => {
  it('is globally enabled by default for models without Bridge workspace', () => {
    expect(
      isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-4o', env: configured }),
    ).toBe(true);
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, env: configured })).toBe(true);
  });

  it('is not added to Bridge models', () => {
    expect(
      isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'claude-max', env: configured }),
    ).toBe(false);
    expect(
      isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-codex-fast', env: configured }),
    ).toBe(false);
  });

  it('honors the user-global opt-out', () => {
    expect(
      isRokoWorkspaceEnabled({
        user: { id: 'user-1', personalization: { workspace: false } },
        model: 'gpt-4o',
        env: configured,
      }),
    ).toBe(false);
  });

  it('stays disabled instead of throwing when the key is missing or too short', () => {
    const missingKey = { ROKO_WORKSPACE_URL: 'http://roko-workspace:8080' } as NodeJS.ProcessEnv;
    expect(
      isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-4o', env: missingKey }),
    ).toBe(false);
  });

  it('stays disabled until a workspace endpoint is configured', () => {
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-4o', env: {} })).toBe(
      false,
    );
  });
});

describe('Roko workspace identity', () => {
  it('prefers the tenant carried by the user', () => {
    expect(
      rokoWorkspaceIdentity({ user: { id: 'user-1', tenantId: 'tenant-a' }, conversationId: 'c1' }),
    ).toEqual({ tenantId: 'tenant-a', userId: 'user-1', conversationId: 'c1' });
  });

  it('takes the request tenant when the user is a safe projection without tenantId', async () => {
    const identity = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      rokoWorkspaceIdentity({ user: { id: 'user-1' }, conversationId: 'c1' }),
    );
    expect(identity).toEqual({ tenantId: 'tenant-b', userId: 'user-1', conversationId: 'c1' });
  });

  it('uses the empty tenant only for single-tenant deployments', () => {
    expect(
      rokoWorkspaceIdentity({ user: { id: 'user-1' }, conversationId: 'c1', env: {} }),
    ).toEqual({ tenantId: '', userId: 'user-1', conversationId: 'c1' });
  });

  it('refuses an identity without tenant under strict tenant isolation', () => {
    expect(
      rokoWorkspaceIdentity({
        user: { id: 'user-1' },
        conversationId: 'c1',
        env: { TENANT_ISOLATION_STRICT: 'true' },
      }),
    ).toBeUndefined();
  });

  it('never assigns a workspace to the system tenant sentinel', async () => {
    const strict = { TENANT_ISOLATION_STRICT: 'true' };
    const identity = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, async () =>
      rokoWorkspaceIdentity({ user: { id: 'user-1' }, conversationId: 'c1', env: strict }),
    );
    expect(identity).toBeUndefined();
  });
});
