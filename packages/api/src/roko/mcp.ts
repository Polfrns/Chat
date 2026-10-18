import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RokoError } from './client';
import type { RokoClient } from './client';

interface TextContent {
  type: string;
  text?: string;
}

function resultText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  return (content as TextContent[])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/**
 * One-shot call to a tool on the leedeo-filestore MCP face, for the few
 * operations its management REST does not expose (e.g. `move_file`). Connects,
 * calls, and tears down per invocation — these are occasional user-driven
 * actions, not a hot path.
 */
export async function callRokoMcpTool(
  mcpUrl: string,
  authorization: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: authorization } },
  });
  const client = new Client({ name: 'librechat-roko-bridge', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = resultText(result.content);
    if (result.isError) {
      throw new RokoError(text.replace(/^Error:\s*/, '') || `${toolName} failed`, 400);
    }
    return text;
  } catch (error) {
    if (error instanceof RokoError) {
      throw error;
    }
    throw new RokoError(
      `Filestore MCP call ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Move or rename a file/folder within a store. The management REST has no
 *  move endpoint, so this bridges to the MCP face's `move_file` tool. */
export async function moveRokoFile(
  roko: RokoClient,
  filestoreUid: string,
  src: string,
  dst: string,
): Promise<void> {
  await callRokoMcpTool(roko.mcpUrl, roko.authorization, 'move_file', {
    filestore_uid: filestoreUid,
    src,
    dst,
  });
}
