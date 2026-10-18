import {applyRokoBridgeContext, isRokoBridgeModel} from './rokoBridge';

const KEY = 'a'.repeat(64);
const BASE = 'http://cli-bridge:4000/v1';

describe('Roko Bridge visibility', () => {
  it('enables safe activity for Codex and Claude without changing headers from untrusted URLs', () => {
    for (const model of ['gpt-codex','claude-max']) {
      const llmConfig: any = {model, configuration:{baseURL:BASE}, includeReasoningContent:false};
      applyRokoBridgeContext({llmConfig, user:{id:'user-1'}, conversationId:'conv-1',
        env:{CLAUDE_BRIDGE_KEY:KEY, ROKO_BRIDGE_BASE_URL:BASE}, now:1700000000000});
      expect(llmConfig.includeReasoningContent).toBe(true);
      expect(llmConfig.configuration.defaultHeaders['X-Roko-Context']).toBeTruthy();
      expect(llmConfig.configuration.defaultHeaders['X-Roko-Signature']).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it('can explicitly disable only the progress UI, preserving signed identity', () => {
    const llmConfig: any = {model:'gpt-codex',configuration:{baseURL:BASE}};
    applyRokoBridgeContext({llmConfig,user:{id:'u'},conversationId:'c',
      env:{CLAUDE_BRIDGE_KEY:KEY,ROKO_BRIDGE_BASE_URL:BASE,ROKO_BRIDGE_ACTIVITY_ENABLED:'false'}});
    expect(llmConfig.includeReasoningContent).toBe(false);
    expect(llmConfig.configuration.defaultHeaders['X-Roko-Signature']).toBeTruthy();
  });
  it('does not enable bridge-specific formatting for LM Studio', () => {
    expect(isRokoBridgeModel('lm-studio')).toBe(false);
  });
});
