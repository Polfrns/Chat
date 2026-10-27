const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

const root = resolve(__dirname, '..');
function source(path) { return readFileSync(resolve(root, path), 'utf8'); }
function moduleURL(code) {
  return 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(code)).toString('base64');
}
const capabilitiesURL = moduleURL(source('packages/data-provider/src/bridgeModels.ts'));
const parametersURL = moduleURL(source('packages/api/src/utils/bridgeParameters.ts')
  .replace("'librechat-data-provider'", JSON.stringify(capabilitiesURL)));
const modules = Promise.all([
  import(capabilitiesURL), import(parametersURL),
  import(moduleURL(source('packages/api/src/utils/rokoBridge.ts')
    .replace("'librechat-data-provider'", JSON.stringify(capabilitiesURL))
    .replace("'./bridgeParameters'", JSON.stringify(parametersURL))
    .replace("require('../../../../config/observability/context.cjs')",
      `require(${JSON.stringify(resolve(root, 'config/observability/context.cjs'))})`)
    .replace("import { createHmac }", "import { createRequire } from 'node:module';\nconst require = createRequire(" +
      JSON.stringify(resolve(root, 'package.json')) + ");\nimport { createHmac }"))),
]);

test('every supported effort survives normalization for its provider', async () => {
  const [{ getBridgeCapabilities }, { normalizeBridgeParameters }] = await modules;
  for (const model of ['gpt-codex', 'gpt-codex-fast', 'gpt-codex-deep', 'claude-max', 'claude-max-fast', 'claude-max-deep']) {
    for (const effort of getBridgeCapabilities(model).efforts) {
      const normalized = normalizeBridgeParameters(model, { reasoning_effort: effort, reasoning: { effort } });
      assert.equal(normalized.reasoning_effort, effort);
      assert.equal(normalized.reasoning.effort, effort);
    }
  }
});

test('changing from Codex to Claude removes stale controls without mutating saved settings', async () => {
  const [, { normalizeBridgeParameters }] = await modules;
  const saved = {
    temperature: 0.2, topP: 0.4, maxTokens: 100, n: 2, reasoning_effort: 'minimal',
    verbosity: 'high', reasoning_summary: 'detailed', reasoning: { effort: 'ultra', summary: 'auto' },
    text: { verbosity: 'low' }, cli_options: { web_search: true }, model: 'claude-max',
  };
  const before = JSON.stringify(saved);
  assert.deepEqual(normalizeBridgeParameters('claude-max', saved),
    { model: 'claude-max', cli_options: { web_search: true } });
  assert.equal(JSON.stringify(saved), before);
  assert.equal(normalizeBridgeParameters('ordinary-api', saved), saved);
  for (const malformed of [null, [], 'high']) {
    assert.deepEqual(normalizeBridgeParameters('gpt-codex', {
      reasoning: malformed, text: malformed, cli_options: malformed,
    }), {});
  }
});

test('Responses replay drops only opaque reasoning and preserves tool call/result pairing', async () => {
  const [, { normalizeBridgeRequest }] = await modules;
  const input = [
    { role: 'user', content: 'hello' },
    { type: 'reasoning', encrypted_content: 'private', summary: [] },
    { type: 'function_call', call_id: 'c1', name: 'lookup', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c1', output: 'result' },
    { role: 'assistant', content: 'answer' },
  ];
  for (const model of ['gpt-codex', 'claude-max']) {
    assert.deepEqual(normalizeBridgeRequest(model, { input }).input, input.filter(item => item.type !== 'reasoning'));
    assert.equal(input.length, 5);
  }
  const body = { input };
  assert.equal(normalizeBridgeRequest('ordinary-api', body), body);
});

test('signed options match the provider and outgoing JSON is compatible with older Bridge', async () => {
  const [, , { applyRokoBridgeContext }] = await modules;
  const baseURL = 'http://bridge:4000/v1';
  const env = { CLAUDE_BRIDGE_KEY: 'test-key-'.repeat(8), ROKO_BRIDGE_BASE_URL: baseURL };
  const original = { baseURL, defaultHeaders: { 'X-Existing': 'kept' } };
  const config = { model: 'claude-max', configuration: original, reasoning_effort: 'high',
    modelKwargs: { reasoning_summary: 'detailed', verbosity: 'low', cli_options: { web_search: true } } };
  applyRokoBridgeContext({ llmConfig: config, user: { id: 'u' }, conversationId: 'c', env });
  const context = JSON.parse(Buffer.from(config.configuration.defaultHeaders['X-Roko-Context'], 'base64url'));
  assert.deepEqual(context.options, { reasoning_effort: 'high', web_search: true });
  assert.deepEqual(original, { baseURL, defaultHeaders: { 'X-Existing': 'kept' } });
  const actualFetch = global.fetch;
  const calls = [];
  global.fetch = async (input, init) => { calls.push({ input, init }); return new Response('{}'); };
  try {
    const input = [{ type: 'reasoning' }, { type: 'function_call_output', call_id: 'c', output: 'OK' }];
    const body = JSON.stringify({ model: config.model, input, verbosity: 'high' });
    await config.configuration.fetch(baseURL + '/responses', { method: 'POST', body });
    await config.configuration.fetch(new Request(baseURL + '/responses', { method: 'POST', body }));
    for (const call of calls) {
      assert.deepEqual(JSON.parse(call.init.body), { model: config.model, input: [input[1]] });
      assert.equal(call.init.redirect, 'error');
    }
    await assert.rejects(config.configuration.fetch('https://foreign.example/v1/responses'), /configured Bridge URL/);
    await assert.rejects(config.configuration.fetch('http://bridge:4000/v10/responses'), /configured Bridge URL/);
    assert.equal(calls.length, 2);
  } finally { global.fetch = actualFetch; }
});

test('model-aware settings separate Default from Auto and preserve valid configured defaults', async () => {
  const code = source('packages/data-provider/src/parameterSettings.ts');
  const fragment = code.slice(code.indexOf('export function applyModelAwareDefaults('));
  const { applyModelAwareDefaults } = await import(moduleURL(
    `import {getBridgeCapabilities} from ${JSON.stringify(capabilitiesURL)};
    const ReasoningEffort={unset:''}; const ReasoningSummary={none:''}; const Verbosity={none:''};
    const EModelEndpoint={google:'google'}; const googleSettings={};\n` + fragment));
  const settings = [
    { key: 'reasoning_summary', default: 'detailed', enumMappings: { auto: 'com_ui_auto' } },
    { key: 'verbosity', default: 'low' }, { key: 'reasoning_effort', default: 'minimal' },
    { key: 'temperature' }, { key: 'web_search' },
  ];
  const codex = applyModelAwareDefaults(settings, 'custom', 'gpt-codex');
  assert.deepEqual(codex[0].options, ['', 'auto', 'concise', 'detailed', 'none']);
  assert.notEqual(codex[0].enumMappings[''], codex[0].enumMappings.auto);
  assert.equal(codex[0].default, 'detailed');
  assert.equal(codex[1].default, 'low');
  assert.equal(codex[3].readonly, true);
  const claude = applyModelAwareDefaults(settings, 'custom', 'claude-max');
  assert.equal(claude[2].default, '');
  for (const index of [0, 1, 3]) assert.equal(claude[index].readonly, true);
  assert.equal(claude[4].readonly, undefined);
});

test('explicit summary none disables summary display while Auto and the preset remain distinct', async () => {
  const [, , { applyRokoBridgeContext }] = await modules;
  for (const summary of ['', 'auto', 'concise', 'detailed', 'none']) {
    const config = { model: 'gpt-codex', reasoning_summary: summary,
      configuration: { baseURL: 'http://bridge:4000/v1' }, modelKwargs: { cli_options: { web_search: false } } };
    applyRokoBridgeContext({ llmConfig: config, user: { id: 'u' }, conversationId: 'c',
      env: { CLAUDE_BRIDGE_KEY: 'test-key-'.repeat(8), ROKO_BRIDGE_BASE_URL: 'http://bridge:4000/v1' } });
    const context = JSON.parse(Buffer.from(config.configuration.defaultHeaders['X-Roko-Context'], 'base64url'));
    assert.equal(context.options.reasoning_summary, summary || undefined);
    assert.equal(context.options.web_search, false);
    assert.equal(config.includeReasoningContent, summary !== 'none');
  }
});

test('the real LLM constructor normalizes both protocols before sending to either CLI', async () => {
  const [, { normalizeBridgeParameters }, { isRokoBridgeModel }] = await modules;
  const code = stripTypeScriptTypes(source('packages/api/src/endpoints/openai/llm.ts')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replaceAll('export ', ''));
  const getConfig = vm.runInNewContext(code + '\ngetOpenAILLMConfig;', {
    EModelEndpoint: { openAI: 'openAI', azureOpenAI: 'azureOpenAI' },
    ReasoningParameterFormat: { disabled: 'disabled', reasoningEffort: 'reasoning_effort', reasoningObject: 'reasoning' },
    removeNullishValues: obj => Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null && value !== '')),
    normalizeBridgeParameters, isRokoBridgeModel, isEnabled: value => value === true,
    supportsAdaptiveThinking: () => false,
    process: { env: {} },
  });
  for (const useResponsesApi of [true, false]) {
    for (const model of ['gpt-codex', 'claude-max']) {
      const { llmConfig } = getConfig({ apiKey: 'test', endpoint: 'custom', streaming: true,
        modelOptions: { model, useResponsesApi, reasoning_effort: 'high', reasoning_summary: 'detailed',
          verbosity: 'low', web_search: true, temperature: 0.4, topP: 0.2, max_tokens: 100, n: 2 } });
      assert.equal(llmConfig.useResponsesApi, useResponsesApi);
      const kwargs = llmConfig.modelKwargs ?? {};
      for (const key of ['temperature', 'topP', 'maxTokens', 'n']) {
        assert.equal(llmConfig[key], undefined);
        assert.equal(kwargs[key], undefined);
      }
      if (model === 'claude-max') {
        assert.equal(llmConfig.verbosity, undefined);
        assert.equal(kwargs.verbosity, undefined);
        assert.equal(kwargs.reasoning_summary, undefined);
        assert.equal(kwargs.reasoning?.summary, undefined);
      }
      assert.equal(kwargs.cli_options?.web_search ?? kwargs.web_search ?? llmConfig.web_search, true);
    }
  }
  const direct = getConfig({ apiKey: 'test', endpoint: 'openAI', streaming: true,
    modelOptions: { model: 'gpt-4.1', temperature: 0.4, web_search: true } });
  assert.equal(direct.llmConfig.temperature, 0.4);
  assert.equal(direct.tools[0].type, 'web_search');
});
