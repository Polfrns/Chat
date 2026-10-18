import { getClaudeLLMConfig } from './llm';

jest.mock('./fetch', () => ({
  createClaudeFetch: jest.fn(() => jest.fn()),
}));

describe('claude/llm', () => {
  it('builds a native Anthropic config with the OAuth fetch attached', () => {
    const result = getClaudeLLMConfig({ modelOptions: { model: 'claude-opus-4-8' } });

    expect(result.provider).toBe('anthropic');
    const clientOptions = result.llmConfig.clientOptions as Record<string, unknown> | undefined;
    expect(typeof clientOptions?.fetch).toBe('function');
    /** Placeholder key — the real bearer is injected by the fetch. */
    expect((result.llmConfig as Record<string, unknown>).apiKey).toBe('claude-oauth');
    expect(result.llmConfig.model).toBe('claude-opus-4-8');
  });
});
