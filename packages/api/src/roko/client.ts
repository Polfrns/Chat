export interface RokoFilestore {
  uid: string;
  displayName: string;
  description: string;
  kind: 'local' | 'graph';
  ref: string;
  readOnly: boolean;
  shared: boolean;
  ephemeral: boolean;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface RokoFileEntry {
  path: string;
  bytes: number;
  mtimeMs: number;
  type: 'file' | 'dir';
}

export interface CreateRokoFilestore {
  displayName: string;
  description?: string;
  shared?: boolean;
  readOnly?: boolean;
}

export type UpdateRokoFilestore = Partial<
  Pick<RokoFilestore, 'displayName' | 'description' | 'readOnly' | 'shared'>
>;

/** A non-2xx response from Roko, carrying the upstream status so the proxy can
 *  mirror it back to the LibreChat client. */
export class RokoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RokoError';
  }
}

export interface RokoDownload {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
}

interface ErrorBody {
  error?: string;
}

/**
 * HTTP client for the leedeo-filestore service. Auth is a single deployment-wide
 * API key (an opaque bearer bound to a service account on the server); per-user
 * and per-session scoping is enforced on the LibreChat side (session hooks).
 * This is the one place LibreChat speaks to the filestore service over HTTP.
 *
 * Paths mirror the server's Django routes exactly — most are slash-terminated,
 * `register`/`deregister` are not, and a mismatch turns POSTs into body-less
 * redirects.
 */
export class RokoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** The MCP face URL (injected as an MCP server config; see MCP.js). */
  get mcpUrl(): string {
    return `${this.baseUrl}/mcp`;
  }

  /** The bearer for MCP connection headers and every REST call. */
  get authorization(): string {
    return `Bearer ${this.apiKey}`;
  }

  listFilestores(): Promise<{ filestores: RokoFilestore[] }> {
    return this.call('GET', '/api/filestores/');
  }

  /** The server generates the store's opaque uid — callers send metadata only
   *  and read the uid off the response. */
  createFilestore(input: CreateRokoFilestore): Promise<RokoFilestore> {
    return this.call('POST', '/api/filestores/', {
      displayName: input.displayName,
      description: input.description,
      shared: input.shared,
      readOnly: input.readOnly,
    });
  }

  getFilestore(filestoreUid: string): Promise<RokoFilestore> {
    return this.call('GET', `/api/filestores/${encodeURIComponent(filestoreUid)}/`);
  }

  updateFilestore(filestoreUid: string, patch: UpdateRokoFilestore): Promise<RokoFilestore> {
    return this.call('PATCH', `/api/filestores/${encodeURIComponent(filestoreUid)}/`, patch);
  }

  /** Registry record + backing files. The server only allows this for
   *  `ephemeral` stores (ones it provisioned itself). */
  deleteFilestore(filestoreUid: string): Promise<{ deleted: boolean }> {
    return this.call('DELETE', `/api/filestores/${encodeURIComponent(filestoreUid)}/`);
  }

  /** Registry record only — backing files are left untouched. Administrative:
   *  registered (non-ephemeral) stores are org-level fixtures, and the shared
   *  API key would let any LibreChat user unregister them for everyone, so this
   *  is deliberately NOT reachable from user-facing routes. */
  deregisterFilestore(filestoreUid: string): Promise<{ deregistered: boolean }> {
    return this.call('POST', `/api/filestores/${encodeURIComponent(filestoreUid)}/deregister`);
  }

  listFiles(filestoreUid: string): Promise<{ files: RokoFileEntry[] }> {
    return this.call('GET', `/api/filestores/${encodeURIComponent(filestoreUid)}/files/`);
  }

  /** Binary upload (multipart `path` + `file`). The server never overwrites:
   *  an existing destination is a 409, and payloads over 100 MiB are a 413 —
   *  both surface as `RokoError` with that status. */
  async uploadFile(
    filestoreUid: string,
    destinationPath: string,
    file: { buffer: Buffer; filename: string; contentType?: string },
  ): Promise<{ path: string; bytes: number }> {
    const form = new FormData();
    form.append('path', destinationPath);
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], {
        type: file.contentType || 'application/octet-stream',
      }),
      file.filename,
    );
    const response = await this.request(
      'POST',
      `/api/filestores/${encodeURIComponent(filestoreUid)}/files/upload`,
      { body: form },
    );
    const data = (await this.parse(response)) as { path?: string; bytes?: number } | null;
    return { path: data?.path ?? destinationPath, bytes: data?.bytes ?? file.buffer.length };
  }

  /** Binary download as a stream, for piping through to the browser or into
   *  LibreChat's own file storage. */
  async downloadFile(filestoreUid: string, path: string): Promise<RokoDownload> {
    const response = await this.request(
      'GET',
      `/api/filestores/${encodeURIComponent(filestoreUid)}/files/download?path=${encodeURIComponent(path)}`,
    );
    if (!response.ok || !response.body) {
      await this.parse(response);
      throw new RokoError('Filestore download returned no content', 502);
    }
    const length = response.headers.get('content-length');
    return {
      stream: response.body,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      contentLength: length !== null ? Number(length) : null,
    };
  }

  /** Resolve a set of uids to the ones actually accessible — used by the session
   *  layer to validate attachments and to render the sidebar. */
  async accessibleByUids(uids: string[]): Promise<RokoFilestore[]> {
    if (uids.length === 0) {
      return [];
    }
    const wanted = new Set(uids);
    const { filestores } = await this.listFilestores();
    const byUid = new Map(filestores.filter((f) => wanted.has(f.uid)).map((f) => [f.uid, f]));
    return uids.map((uid) => byUid.get(uid)).filter((f): f is RokoFilestore => Boolean(f));
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.request(method, path, {
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return (await this.parse(response)) as T;
  }

  private async request(
    method: string,
    path: string,
    init: { headers?: Record<string, string>; body?: BodyInit } = {},
  ): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: this.authorization, ...init.headers },
        body: init.body,
      });
    } catch (error) {
      throw new RokoError(
        `Filestore service unreachable at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
        502,
      );
    }
  }

  /** JSON body of a 2xx response; a non-2xx becomes a `RokoError` mirroring the
   *  upstream status. */
  private async parse(response: Response): Promise<unknown> {
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = (data as ErrorBody | null)?.error ?? response.statusText;
      throw new RokoError(message, response.status);
    }
    return data;
  }
}
