import { Providers } from '@librechat/agents';
import type { AnthropicLLMConfigResult, AnthropicModelOptions } from '~/types';
import { getLLMConfig as getAnthropicLLMConfig } from '~/endpoints/anthropic/llm';
import { createClaudeFetch } from './fetch';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Placeholder API key. The real bearer token is injected per-request by the
 * custom fetch (`createClaudeFetch`), which also strips the `x-api-key` the
 * Anthropic SDK would otherwise send. The native config only needs a non-empty
 * key to initialize.
 */
const PLACEHOLDER_API_KEY = 'claude-oauth';

export interface ClaudeConfigOptions {
  modelOptions?: AnthropicModelOptions;
  proxy?: string | null;
  headers?: Record<string, string>;
  addParams?: Record<string, unknown>;
  dropParams?: string[];
  defaultParams?: Record<string, unknown>;
}

/**
 * Builds a native Anthropic (`/v1/messages`) config authenticated with a Claude
 * Pro/Max subscription via the Claude Code OAuth token. Returns
 * `provider: anthropic` so the agent uses the native Anthropic client.
 */
export function getClaudeLLMConfig(
  options: ClaudeConfigOptions = {},
): AnthropicLLMConfigResult & { provider: Providers } {
  const { modelOptions, proxy, headers, addParams, dropParams, defaultParams } = options;

  /** Proxy is handled inside the custom fetch, not via the client's fetchOptions. */
  const result = getAnthropicLLMConfig(PLACEHOLDER_API_KEY, {
    modelOptions: modelOptions ?? {},
    headers,
    addParams,
    dropParams,
    defaultParams,
  });

  const clientOptions = (result.llmConfig.clientOptions ?? {}) as Record<string, unknown>;
  clientOptions.fetch = createClaudeFetch(proxy) as unknown as Fetch;
  result.llmConfig.clientOptions = clientOptions as typeof result.llmConfig.clientOptions;

  return { ...result, provider: Providers.ANTHROPIC };
}
