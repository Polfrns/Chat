import type { RokoWorkspaceConfig, RokoWorkspaceIdentity } from './workspace';
import { signRokoWorkspaceContext } from './workspaceContext';

/** A non-2xx response (or transport failure) from the workspace service. */
export class RokoWorkspaceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RokoWorkspaceError';
  }
}

export interface RokoWorkspaceUpload {
  /** Workspace-relative path the service chose, e.g. `inputs/report-2.pdf`. */
  path: string;
  bytes: number;
}

export interface RokoWorkspaceDownload {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

interface ErrorBody {
  code?: string;
  message?: string;
}

/**
 * Internal REST client for the roko-workspace service. Each call signs its own
 * identity explicitly: REST calls are made on behalf of a known conversation,
 * unlike MCP traffic, which is signed per HTTP request from the async context.
 */
export class RokoWorkspaceClient {
  constructor(
    private readonly config: RokoWorkspaceConfig,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async uploadInput(
    identity: RokoWorkspaceIdentity,
    filename: string,
    buffer: Buffer,
  ): Promise<RokoWorkspaceUpload> {
    const response = await this.request(
      identity,
      'PUT',
      `/v1/workspace/inputs/${encodeURIComponent(filename)}`,
      {
        body: new Uint8Array(buffer),
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(buffer.length),
        },
      },
    );
    return (await this.json(response)) as RokoWorkspaceUpload;
  }

  /** `path` is relative to the workspace and must start with `outputs/`. */
  async downloadOutput(
    identity: RokoWorkspaceIdentity,
    path: string,
  ): Promise<RokoWorkspaceDownload> {
    const segments = path.split('/');
    if (
      segments[0] !== 'outputs' ||
      segments.length < 2 ||
      segments.some(
        (segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'),
      )
    ) {
      throw new RokoWorkspaceError(
        'Only files under outputs/ can be delivered',
        400,
        'invalid_path',
      );
    }
    const encoded = segments.slice(1).map(encodeURIComponent).join('/');
    const response = await this.request(identity, 'GET', `/v1/workspace/outputs/${encoded}`);
    if (!response.ok) {
      await this.json(response);
    }
    const header = response.headers.get('x-workspace-filename');
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      filename: header ? decodeURIComponent(header) : segments[segments.length - 1],
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  async deleteWorkspace(identity: RokoWorkspaceIdentity): Promise<void> {
    const response = await this.request(identity, 'DELETE', '/v1/workspace');
    if (!response.ok) {
      await this.json(response);
    }
  }

  private async request(
    identity: RokoWorkspaceIdentity,
    method: string,
    path: string,
    init: { headers?: Record<string, string>; body?: BodyInit } = {},
  ): Promise<Response> {
    try {
      return await fetch(`${this.config.baseUrl}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.config.key}`,
          ...signRokoWorkspaceContext(identity, this.config.key, this.env),
          ...init.headers,
        },
        body: init.body,
      });
    } catch (error) {
      throw new RokoWorkspaceError(
        `Workspace service unreachable: ${error instanceof Error ? error.message : String(error)}`,
        502,
        'unreachable',
      );
    }
  }

  /** JSON body of a 2xx response; a non-2xx becomes a `RokoWorkspaceError`. */
  private async json(response: Response): Promise<unknown> {
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      if (response.ok) {
        throw new RokoWorkspaceError(
          'Workspace service returned invalid JSON',
          502,
          'bad_response',
        );
      }
    }
    if (!response.ok) {
      const body = (data ?? {}) as ErrorBody;
      throw new RokoWorkspaceError(
        body.message ?? response.statusText,
        response.status,
        body.code ?? 'error',
      );
    }
    return data;
  }
}
