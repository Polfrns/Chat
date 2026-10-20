import {
  EModelEndpoint,
  KnownEndpoints,
  extractEnvVariable,
  normalizeEndpointName,
} from 'librechat-data-provider';
import type { TCustomEndpoints, TEndpoint } from 'librechat-data-provider';
import type { TCustomEndpointsConfig } from '~/types/endpoints';
import { isUserProvided } from '~/utils';

/**
 * Load config endpoints from the cached configuration object
 * @param customEndpointsConfig - The configuration object
 */
export function loadCustomEndpointsConfig(
  customEndpoints?: TCustomEndpoints,
): TCustomEndpointsConfig | undefined {
  if (!customEndpoints) {
    return;
  }

  const customEndpointsConfig: TCustomEndpointsConfig = {};

  if (Array.isArray(customEndpoints)) {
    const filteredEndpoints = customEndpoints.filter(
      (endpoint) =>
        /** Claude authenticates via OAuth and targets the Anthropic API, so it
         *  needs neither `baseURL` nor `apiKey` in config. */
        (endpoint.provider === KnownEndpoints.claude || (endpoint.baseURL && endpoint.apiKey)) &&
        endpoint.name &&
        endpoint.models &&
        (endpoint.models.fetch || endpoint.models.default),
    );

    for (let i = 0; i < filteredEndpoints.length; i++) {
      const endpoint = filteredEndpoints[i] as TEndpoint;
      const {
        baseURL,
        apiKey,
        name: configName,
        iconURL,
        modelDisplayLabel,
        customParams,
        provider,
      } = endpoint;
      const name = normalizeEndpointName(configName);

      const resolvedApiKey = extractEnvVariable(apiKey ?? '');
      const resolvedBaseURL = extractEnvVariable(baseURL ?? '');

      /**
       * A native `provider` (e.g. anthropic) implies its parameter set. Surface it
       * as `defaultParamsEndpoint` so the client param panel shows the right fields
       * (e.g. `maxOutputTokens`/`thinking` for Anthropic, not OpenAI `max_tokens`),
       * unless an admin explicitly chose a non-default `defaultParamsEndpoint`.
       * `claude` speaks the native Anthropic API, so it maps to the Anthropic set.
       */
      const paramSetProvider =
        provider === KnownEndpoints.claude ? EModelEndpoint.anthropic : provider;
      const resolvedCustomParams =
        provider != null &&
        (customParams?.defaultParamsEndpoint == null ||
          customParams.defaultParamsEndpoint === EModelEndpoint.custom)
          ? { ...customParams, defaultParamsEndpoint: paramSetProvider }
          : customParams;

      customEndpointsConfig[name] = {
        type: EModelEndpoint.custom,
        userProvide: isUserProvided(resolvedApiKey),
        userProvideURL: isUserProvided(resolvedBaseURL),
        customParams: resolvedCustomParams,
        modelDisplayLabel,
        iconURL,
      };
    }
  }

  return customEndpointsConfig;
}
