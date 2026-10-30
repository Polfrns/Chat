import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { identityFromAuthHeader } from './auth';
import type { Request, Response } from 'express';
import type { FilestoreService } from './service';
import type { Config } from './config';
import type { Filestore, Identity } from './types';

const SERVER_NAME = 'leedeo-filestore';
const SERVER_VERSION = '0.1.0';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({
  content: [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
});
const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: `Error: ${message}` }],
  isError: true,
});

/** The model's view of a store (snake_case, no internal `ref`/locator). */
const describe = (s: Filestore) => ({
  filestore_id: s.id,
  display_name: s.displayName,
  description: s.description || undefined,
  kind: s.kind,
  shared: s.shared,
  read_only: s.readOnly,
});

/** Register a tool that runs against the live caller identity and folds typed
 *  failures into an `isError` result. Typing flows from the zod shape. */
function register<S extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: S,
  handler: (who: Identity, args: z.infer<z.ZodObject<S>>) => Promise<unknown> | unknown,
  getIdentity: () => Identity,
): void {
  // The SDK's callback type is a conditional on the shape, which TS cannot resolve
  // for a generic `S`; widen here and narrow back for the typed handler.
  server.tool(name, description, shape as z.ZodRawShape, async (args) => {
    try {
      return ok(await handler(getIdentity(), args as z.infer<z.ZodObject<S>>));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  });
}

function buildServer(service: FilestoreService, getIdentity: () => Identity): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  register(
    server,
    'list_filestores',
    'List every file store you can reach (shared in your tenant + your own private ones). Use the returned filestore_id with the other tools.',
    {},
    (who) => service.listAccessible(who).map(describe),
    getIdentity,
  );

  register(
    server,
    'create_filestore',
    'Create a new file store for working with files. Returns its filestore_id.',
    {
      display_name: z.string().describe('Human-readable name'),
      description: z.string().optional().describe('What this store is for'),
      shared: z
        .boolean()
        .optional()
        .describe('Visible to everyone in the tenant (default: private to you)'),
      read_only: z.boolean().optional().describe('Reject writes once created'),
    },
    async (who, a) =>
      describe(
        await service.createFilestore(who, {
          displayName: a.display_name,
          description: a.description,
          shared: a.shared,
          readOnly: a.read_only,
        }),
      ),
    getIdentity,
  );

  register(
    server,
    'list_files',
    'Recursively list files and folders in a file store (folders shown with a trailing slash).',
    {
      filestore_id: z.string(),
      subdir: z.string().optional().describe('Optional subdirectory to list'),
    },
    async (who, a) => {
      const files = await service.listFiles(who, a.filestore_id, a.subdir);
      return files.length
        ? files.map((f) => (f.type === 'dir' ? `${f.path}/` : f.path)).join('\n')
        : '(empty)';
    },
    getIdentity,
  );

  register(
    server,
    'read_file',
    'Read a file as text from a file store.',
    { filestore_id: z.string(), path: z.string().describe('Store-relative file path') },
    (who, a) => service.readFile(who, a.filestore_id, a.path),
    getIdentity,
  );

  register(
    server,
    'write_file',
    'Write (create or overwrite) a text file in a file store.',
    {
      filestore_id: z.string(),
      path: z.string().describe('Store-relative file path'),
      content: z.string().describe('Full file contents'),
    },
    async (who, a) => `Wrote ${await service.writeFile(who, a.filestore_id, a.path, a.content)}`,
    getIdentity,
  );

  register(
    server,
    'create_folder',
    'Create a folder in a file store.',
    { filestore_id: z.string(), path: z.string().describe('Store-relative folder path') },
    async (who, a) => `Created ${await service.createFolder(who, a.filestore_id, a.path)}`,
    getIdentity,
  );

  register(
    server,
    'move_file',
    'Move or rename a file or folder within a file store.',
    { filestore_id: z.string(), src: z.string(), dst: z.string() },
    async (who, a) => `Moved to ${await service.moveFile(who, a.filestore_id, a.src, a.dst)}`,
    getIdentity,
  );

  register(
    server,
    'search_files',
    'Find a literal substring across the text files of a file store.',
    { filestore_id: z.string(), query: z.string().describe('Literal substring to search for') },
    async (who, a) => {
      const hits = await service.searchFiles(who, a.filestore_id, a.query);
      return hits.length
        ? hits.map((h) => `${h.path}:${h.line}: ${h.snippet}`).join('\n')
        : 'No matches.';
    },
    getIdentity,
  );

  return server;
}

/**
 * Streamable-HTTP MCP face. The caller identity is read from the bearer token on
 * EVERY request and refreshed onto a reused connection — so a connection that is
 * reused (e.g. across an agent's turns) always acts as the current caller, never
 * a stale one. Roko is session-agnostic: identity is `{subject, tenant}`, nothing
 * about chat sessions.
 */
export function createMcpRouter(service: FilestoreService, config: Config): express.Router {
  const router = express.Router();
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; identity: { current: Identity } }
  >();

  router.post('/', async (req: Request, res: Response) => {
    const identity = identityFromAuthHeader(req.headers.authorization, config.jwtSecret);
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const sessionId = req.headers['mcp-session-id'];
    const existing = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;

    let transport: StreamableHTTPServerTransport;
    if (existing) {
      existing.identity.current = identity;
      transport = existing.transport;
    } else {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({ error: 'No valid session; expected an initialize request' });
        return;
      }
      const holder = { current: identity };
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, identity: holder });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };
      await buildServer(service, () => holder.current).connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  });

  const stream = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'];
    const entry = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
    if (!entry) {
      res.status(400).send('Invalid or missing session id');
      return;
    }
    await entry.transport.handleRequest(req, res);
  };
  router.get('/', stream);
  router.delete('/', stream);

  return router;
}
