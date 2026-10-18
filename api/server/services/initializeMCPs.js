const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
const { createMCPServersRegistry, createMCPManager } = require('~/config');

/** SSRF allow-list entries (`host:port`) for the standalone Roko service, derived
 *  from ROKO_SERVER_URL; loopback names are paired so either spelling resolves. */
function rokoAllowedAddresses() {
  const url = new URL(process.env.ROKO_SERVER_URL || 'http://localhost:3100');
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
    /** Roko: exempt the standalone Roko service's address from the SSRF allow-list
     *  so its streamable-HTTP MCP connection is reachable. Derived from
     *  ROKO_SERVER_URL — must match the URL injected in MCP.js. */
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
