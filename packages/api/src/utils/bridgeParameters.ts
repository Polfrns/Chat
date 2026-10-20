import { getBridgeCapabilities } from 'librechat-data-provider';

type ParameterRecord = Record<string, unknown>;

const API_PARAMETERS = [
  'temperature', 'top_p', 'topP', 'top_k', 'topK', 'frequency_penalty', 'frequencyPenalty',
  'presence_penalty', 'presencePenalty', 'max_tokens', 'maxTokens', 'maxCompletionTokens',
  'max_completion_tokens', 'max_output_tokens', 'stop', 'stopSequences', 'seed',
  'logitBias', 'logit_bias', 'logprobs', 'topLogprobs', 'top_logprobs', 'n', 'response_format',
];

function record(value: unknown): ParameterRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ParameterRecord : undefined;
}

/** Saved values for disabled controls must not leak into another CLI provider. */
export function normalizeBridgeParameters(model: string, parameters: ParameterRecord): ParameterRecord {
  const capabilities = getBridgeCapabilities(model);
  if (!capabilities) return parameters;
  const result = { ...parameters };
  for (const name of API_PARAMETERS) delete result[name];
  const validEffort = (value: unknown) =>
    typeof value === 'string' && capabilities.efforts.includes(value);
  const validSummary = (value: unknown) => capabilities.supportsSummary &&
    ['auto', 'concise', 'detailed', 'none'].includes(String(value));
  const validVerbosity = (value: unknown) => capabilities.supportsVerbosity &&
    ['low', 'medium', 'high'].includes(String(value));

  if (!validEffort(result.reasoning_effort)) delete result.reasoning_effort;
  if (!validSummary(result.reasoning_summary)) delete result.reasoning_summary;
  if (!validVerbosity(result.verbosity)) delete result.verbosity;
  if (!capabilities.supportsWebSearch || typeof result.web_search !== 'boolean') delete result.web_search;

  const reasoning = record(parameters.reasoning);
  if (reasoning) {
    const supported = {
      ...(validEffort(reasoning.effort) ? { effort: reasoning.effort } : {}),
      ...(validSummary(reasoning.summary) ? { summary: reasoning.summary } : {}),
    };
    if (Object.keys(supported).length) result.reasoning = supported;
    else delete result.reasoning;
  } else delete result.reasoning;
  const text = record(parameters.text);
  if (text) {
    const supported = { ...text };
    if (!validVerbosity(supported.verbosity)) delete supported.verbosity;
    if (Object.keys(supported).length) result.text = supported;
    else delete result.text;
  } else delete result.text;
  const cli = record(parameters.cli_options);
  if (cli) {
    const controls = Object.fromEntries(
      ['model', 'reasoning_effort', 'verbosity', 'reasoning_summary', 'web_search']
        .filter((key) => key in cli).map((key) => [key, cli[key]]),
    );
    result.cli_options = normalizeBridgeParameters(model, controls);
  } else delete result.cli_options;
  return result;
}

/** CLI conversation state lives in messages/tool results, not opaque Responses reasoning. */
export function normalizeBridgeRequest(model: string, body: ParameterRecord): ParameterRecord {
  if (!getBridgeCapabilities(model)) return body;
  const result = normalizeBridgeParameters(model, body);
  if (Array.isArray(body.input)) {
    result.input = body.input.filter((item: unknown) => record(item)?.type !== 'reasoning');
  }
  return result;
}
