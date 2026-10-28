const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
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
 * Initialize MCP servers
 */
async function initializeMCPs() {
  const appConfig = await getAppConfig({ baseOnly: true });
  const mcpServers = appConfig.mcpConfig;

  try {
    /** Roko: permit only the configured workspace service host and port. */
    const allowedAddresses = [
      ...(appConfig?.mcpSettings?.allowedAddresses ?? []),
      ...rokoAllowedAddresses(),
    ];
    createMCPServersRegistry(mongoose, appConfig?.mcpSettings?.allowedDomains, allowedAddresses);
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  try {
    const mcpManager = await createMCPManager(mcpServers || {});

    if (mcpServers && Object.keys(mcpServers).length > 0) {
      const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
      await mergeAppTools(mcpTools);
      const serverCount = Object.keys(mcpServers).length;
      const toolCount = Object.keys(mcpTools).length;
      logger.info(
        `[MCP] Initialized with ${serverCount} configured ${serverCount === 1 ? 'server' : 'servers'} and ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}.`,
      );
    } else {
      logger.debug('[MCP] No servers configured. MCPManager ready for UI-based servers.');
    }
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPManager:', error);
    throw error;
  }
}

module.exports = initializeMCPs;
