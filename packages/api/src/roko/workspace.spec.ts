import { isRokoWorkspaceEnabled } from './workspace';

const configured: NodeJS.ProcessEnv = {
  ROKO_WORKSPACE_URL: 'http://roko-workspace:8080',
  ROKO_WORKSPACE_KEY: 'k'.repeat(32),
};

describe('Roko workspace MCP selection', () => {
  it('is globally enabled by default for models without Bridge workspace', () => {
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-4o', env: configured })).toBe(true);
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, env: configured })).toBe(true);
  });

  it('is not added to Bridge models', () => {
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'claude-max', env: configured })).toBe(false);
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-codex-fast', env: configured })).toBe(false);
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

  it('stays disabled until a workspace endpoint is configured', () => {
    expect(isRokoWorkspaceEnabled({ user: { id: 'user-1' }, model: 'gpt-4o', env: {} })).toBe(false);
  });
});
