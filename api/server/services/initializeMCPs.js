const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  registerShutdownTask,
  setMCPToolsChangedHandler,
  getDeploymentPluginMcpServers,
  setMCPToolsChangedGenerationHandler,
  setMCPToolsChangedGenerationRenewalHandler,
  setMCPToolsChangedRevisionHandler,
} = require('@librechat/api');
const { syncStaticTools, mergeAppTools, getAppConfig, invalidateCachedTools } = require('./Config');
const { startMCPAuthorizationFenceRetryWorker } = require('./MCPAuthorizationFenceRetry');
const {
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
  updateMCPServerTools,
} = require('./Config/mcp');
const { createMCPServersRegistry, createMCPManager } = require('~/config');

/** SSRF allow-list entries (`host:port`) for the Docker-internal workspace. */
function rokoAllowedAddresses() {
  const rawUrl = process.env.ROKO_WORKSPACE_URL;
  if (!rawUrl) {
    return [];
  }
  const url = new URL(rawUrl);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const addresses = [`${url.hostname}:${port}`];
  if (url.hostname === 'localhost') {
    addresses.push(`127.0.0.1:${port}`);
  } else if (url.hostname === '127.0.0.1') {
    addresses.push(`localhost:${port}`);
  }
  return addresses;
}

/**
 * Resolves the current request's effective MCP allowlists from the merged (tenant-scoped)
 * config. The registry calls this per inspection/connection so admin-panel `mcpSettings`
 * overrides are honored without a restart. Tenant comes from the ALS context inside
 * `getAppConfig`; `userId`/`role` pick up user/role-scoped overrides when an actor exists.
 * @param {{ userId?: string, role?: string }} [ctx]
 */
async function resolveMCPAllowlists(ctx) {
  const appConfig = await getAppConfig({ role: ctx?.role, userId: ctx?.userId });
  return {
    allowedDomains: appConfig?.mcpSettings?.allowedDomains,
    allowedAddresses: [
      ...(appConfig?.mcpSettings?.allowedAddresses ?? []),
      ...rokoAllowedAddresses(),
    ],
  };
}

/**
 * Refreshes one server's tools after it reported `notifications/tools/list_changed`.
 *
 * A server that builds tools at runtime is the case this exists for: without it the tool list
 * stayed frozen at connection time and only a restart picked up the change (#7117). The list is
 * re-fetched from the live connection and written over that server's cache entry, so tools that
 * disappeared stop being advertised too.
 */
async function refreshChangedServerTools({
  serverName,
  userId,
  tools,
  serverConfig,
  publicationGeneration,
  publicationRevision,
}) {
  await updateMCPServerTools({
    userId,
    serverName,
    tools,
    serverConfig,
    ...(publicationGeneration && { publicationGeneration }),
    ...(publicationRevision && { publicationRevision }),
  });
  const toolCount = tools.length;
  logger.info(
    `[MCP][${serverName}] Tool list changed; refreshed ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}${userId ? ` for user ${userId}` : ''}`,
  );
}

/**
 * Merges Agent Plugins MCP servers under the configured servers. A plugin never
 * displaces a server the operator declared in `librechat.yaml`.
 */
function withPluginServers(configured) {
  const pluginServers = getDeploymentPluginMcpServers();
  const names = Object.keys(pluginServers);
  if (names.length === 0) {
    return configured;
  }

  const merged = { ...configured };
  for (const name of names) {
    /** Own-property check: an inherited member like `toString` is not a conflict. */
    if (Object.hasOwn(merged, name)) {
      logger.warn(
        `[MCP] Plugin server "${name}" conflicts with a configured server and was skipped.`,
      );
      continue;
    }
    /** Defined rather than assigned so a name like `__proto__` cannot reach a setter. */
    Object.defineProperty(merged, name, {
      value: pluginServers[name],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return merged;
}

/**
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const appConfig = await getAppConfig({ baseOnly: true });
  const mcpServers = withPluginServers(appConfig.mcpConfig);

  try {
    /** Roko: permit only the configured workspace service host and port. */
    const allowedAddresses = [
      ...(appConfig?.mcpSettings?.allowedAddresses ?? []),
      ...rokoAllowedAddresses(),
    ];
    createMCPServersRegistry(
      mongoose,
      appConfig?.mcpSettings?.allowedDomains,
      allowedAddresses,
      resolveMCPAllowlists,
    );
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  try {
    const mcpManager = await createMCPManager(mcpServers || {}, {
      catalogRecoveryMaxStateEntries: appConfig?.mcpSettings?.catalogRecovery?.maxStateEntries,
      catalogRecoveryMaxDetachedDiscoveries:
        appConfig?.mcpSettings?.catalogRecovery?.maxDetachedDiscoveries,
    });
    startMCPAuthorizationFenceRetryWorker(invalidateCachedTools, {
      intervalMs: appConfig?.mcpSettings?.catalogRecovery?.authorizationFenceRetryIntervalMs,
      batchSize: appConfig?.mcpSettings?.catalogRecovery?.authorizationFenceRetryBatchSize,
      attemptTimeoutMs: appConfig?.mcpSettings?.catalogRecovery?.authorizationFenceTimeoutMs,
    });
    setMCPToolsChangedHandler(refreshChangedServerTools);
    setMCPToolsChangedGenerationHandler(getMCPToolsCacheGeneration);
    setMCPToolsChangedGenerationRenewalHandler(renewMCPToolsCacheGeneration);
    setMCPToolsChangedRevisionHandler(({ serverName, configGeneration }) =>
      getNextAppToolsPublicationRevision(serverName, configGeneration),
    );
    registerShutdownTask('MCP app connections', () => mcpManager.disconnectAppServers());

    if (mcpServers && Object.keys(mcpServers).length > 0) {
      const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
      try {
        await mergeAppTools(mcpTools, appConfig.availableTools || {});
      } finally {
        await mcpManager.connectAppServers();
      }
      const serverCount = Object.keys(mcpServers).length;
      const toolCount = Object.keys(mcpTools).length;
      logger.info(
        `[MCP] Initialized with ${serverCount} configured ${serverCount === 1 ? 'server' : 'servers'} and ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}.`,
      );
    } else {
      await syncStaticTools(appConfig.availableTools || {});
      logger.debug('[MCP] No servers configured. MCPManager ready for UI-based servers.');
    }
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPManager:', error);
    throw error;
  }
}

module.exports = initializeMCPs;
module.exports.refreshChangedServerTools = refreshChangedServerTools;
