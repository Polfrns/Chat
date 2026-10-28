import { createHmac } from 'node:crypto';
import { getBridgeCapabilities } from 'librechat-data-provider';
import { normalizeBridgeParameters, normalizeBridgeRequest } from './bridgeParameters';

type BridgeUser = { id?: string; tenantId?: string };
type BridgeLLMConfig = {
  model?: string;
  configuration?: { baseURL?: string; defaultHeaders?: Record<string, string>; fetch?: typeof fetch };
  modelKwargs?: Record<string, unknown>;
  reasoning?: { effort?: string; summary?: string };
  reasoning_effort?: string | null;
  reasoning_summary?: string | null;
  verbosity?: string | null;
  includeReasoningContent?: boolean;
  timeout?: number;
};

export function isRokoBridgeModel(model?: string): boolean {
  return getBridgeCapabilities(model) !== undefined;
}

/** Adds trusted identity only to the administrator's fixed bridge URL. */
export function applyRokoBridgeContext({
  llmConfig,
  user,
  conversationId,
  env = process.env,
  now = Date.now(),
}: {
  llmConfig: object;
  user?: BridgeUser;
  conversationId?: string;
  env?: NodeJS.ProcessEnv;
  now?: number;
}): void {
  const config = llmConfig as BridgeLLMConfig;
  if (!isRokoBridgeModel(config.model)) return;
  const bridgeModel = config.model!;
  const timeout = Number(env.ROKO_BRIDGE_REQUEST_TIMEOUT_MS || 620000);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 3600000) {
    throw new Error('ROKO_BRIDGE_REQUEST_TIMEOUT_MS must be between 1000 and 3600000.');
  }
  const expectedURL = env.ROKO_BRIDGE_BASE_URL || 'http://host.docker.internal:4000/v1';
  if (config.configuration?.baseURL?.replace(/\/+$/, '') !== expectedURL.replace(/\/+$/, '')) {
    throw new Error('Roko CLI models must use the configured ROKO_BRIDGE_BASE_URL.');
  }
  const key = env.CLAUDE_BRIDGE_KEY;
  if (!key || key.length < 32 || !user?.id || !conversationId) {
    throw new Error('Roko CLI requests require a server bridge key, authenticated user and conversation.');
  }
  config.timeout = timeout;
  const normalized = normalizeBridgeParameters(bridgeModel, config as Record<string, unknown>);
  for (const field of Object.keys(config)) {
    if (!(field in normalized)) delete (config as Record<string, unknown>)[field];
  }
  Object.assign(config, normalized);
  if (config.modelKwargs) {
    config.modelKwargs = normalizeBridgeParameters(bridgeModel, config.modelKwargs);
  }
  const kwargs = config.modelKwargs ?? {};
  const reasoning = (kwargs.reasoning ?? config.reasoning) as BridgeLLMConfig['reasoning'];
  const text = kwargs.text as { verbosity?: string } | undefined;
  const cli = kwargs.cli_options as { web_search?: boolean } | undefined;
  const options = Object.fromEntries(Object.entries({
    reasoning_effort: config.reasoning_effort ?? reasoning?.effort ?? kwargs.reasoning_effort,
    verbosity: config.verbosity ?? text?.verbosity ?? kwargs.verbosity,
    reasoning_summary: config.reasoning_summary ?? reasoning?.summary ?? kwargs.reasoning_summary,
    web_search: cli?.web_search,
  }).filter(([name, value]) => value != null && value !== '' && value !== 'unset' && !(name === 'verbosity' && value === 'none')));
  // Bridge activity deltas use reasoning_content to reuse LibreChat's existing
  // visible progress UI. These are tool statuses, never internal chain-of-thought.
  config.includeReasoningContent = env.ROKO_BRIDGE_ACTIVITY_ENABLED !== 'false' &&
    options.reasoning_summary !== 'none';
  const context = Buffer.from(JSON.stringify({
    userId: user.id, tenantId: user.tenantId ?? '', conversationId,
    model: bridgeModel, options, timestamp: now,
  })).toString('base64url');
  // Copy nested maps: agent configs can be reused by another request or a title run.
  config.configuration = {
    ...config.configuration,
    // Cast: Bun's `typeof fetch` adds a `preconnect` member a plain wrapper does not have.
    fetch: (async (input, init) => {
      const { trustedHeaders } = require('../../../../config/observability/context.cjs');
      const headers = Object.fromEntries(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).entries());
      const url = input instanceof Request ? input.url : String(input);
      const target = new URL(url);
      const base = new URL(expectedURL);
      const basePath = base.pathname.replace(/\/+$/, '');
      if (target.origin !== base.origin || !(target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))) {
        throw new Error('Roko CLI requests cannot leave the configured Bridge URL.');
      }
      let body = init?.body;
      if (body === undefined && input instanceof Request && input.body !== null) {
        body = await input.clone().text();
      }
      if (typeof body === 'string') {
        const payload = JSON.parse(body) as Record<string, unknown>;
        body = JSON.stringify(normalizeBridgeRequest(bridgeModel, payload));
        delete headers['content-length'];
      }
      return fetch(input, {...init, ...(body === undefined ? {} : { body }), headers:trustedHeaders(url, headers), redirect:'error'});
    }) as typeof fetch,
    defaultHeaders: {
      ...Object.fromEntries(Object.entries(config.configuration.defaultHeaders ?? {})
        .filter(([name]) => !['x-roko-context', 'x-roko-signature','traceparent','tracestate','baggage','x-observability-context','x-observability-signature'].includes(name.toLowerCase()))),
      'X-Roko-Context': context,
      'X-Roko-Signature': createHmac('sha256', key).update(context).digest('hex'),
    },
  };
}
