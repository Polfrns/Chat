import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { NextcloudEntry } from 'librechat-data-provider';
import type { NextcloudCredentials, NextcloudLoginFlow, NextcloudListing } from './types';

/** Encrypted proposal bodies must fit in a MongoDB document, including base64 overhead. */
export const MAX_FILE_BYTES: number = 8 * 1024 * 1024;
/** Matches this deployment's serverFileSizeLimit; endpoint-specific upload caps can be lower. */
export const MAX_DOWNLOAD_BYTES: number = 100 * 1024 * 1024;
export const MAX_TEXT_BYTES: number = 512 * 1024;
/** Largest file the tool reads through the document parser (PDF, Office) or as paged text. */
export const MAX_READ_BYTES: number = 15 * 1024 * 1024;
const MAX_LIST_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const FILE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export class NextcloudError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Transport = (url: string, init?: RequestInit) => Promise<Response>;

export function serverUrl(value: string | undefined): string {
  let url: URL;
  try {
    url = new URL(value as string);
  } catch {
    throw new NextcloudError('Nextcloud is not configured', 503);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new NextcloudError('Invalid Nextcloud server configuration', 503);
  }
  return url.href.replace(/\/+$/, '');
}

/** Paths are decoded, user-root-relative names, never URLs or DAV hrefs. */
export function filePath(value: unknown = '', allowRoot = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    // eslint-disable-next-line no-control-regex -- intencionado: rechaza barras invertidas y caracteres de control en rutas
    /[\\\x00-\x1f\x7f]/.test(value)
  ) {
    throw new NextcloudError('Invalid Nextcloud path');
  }
  const segments = value.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.some((segment) => ['.', '..'].includes(segment) || /%[0-9a-f]{2}/i.test(segment))) {
    throw new NextcloudError('Use a decoded path without traversal');
  }
  const normalized = segments.filter(Boolean).join('/');
  if (!normalized && !allowRoot) {
    throw new NextcloudError('A file path is required');
  }
  return normalized;
}

export function isReadOnlyPath(value: string): boolean {
  const normalized = filePath(value, true);
  return normalized.split('/')[0]?.toLowerCase() === 'backups';
}

export function assertWritablePath(value: string): string {
  const normalized = filePath(value);
  if (isReadOnlyPath(normalized)) {
    throw new NextcloudError('The /backups folder is read-only', 403);
  }
  return normalized;
}

interface BoundedResponse {
  headers: { get(name: string): string | null };
  body?: unknown;
}

/** Reads a response body, refusing it as soon as it is known to exceed `limit` bytes. */
export async function boundedBody(response: BoundedResponse, limit: number): Promise<Buffer> {
  const body = response.body as
    | (AsyncIterable<Uint8Array> & { cancel?: () => Promise<void> })
    | null
    | undefined;
  if (Number(response.headers.get('content-length')) > limit) {
    await body?.cancel?.();
    throw new NextcloudError('Nextcloud response exceeds the size limit', 413);
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of body ?? []) {
    length += chunk.length;
    if (length > limit) {
      throw new NextcloudError('Nextcloud response exceeds the size limit', 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

interface DavProp {
  resourcetype?: unknown;
  getcontentlength?: unknown;
  getetag?: unknown;
}
interface DavPropstat {
  status?: string;
  prop?: DavProp;
}
interface DavResponse {
  href: string;
  propstat?: DavPropstat | DavPropstat[];
}

export interface NextcloudAccountInfo extends NextcloudCredentials {
  displayName: string;
}

export class NextcloudWebDAV {
  baseUrl: string;
  private transport: Transport;

  constructor(baseUrl: string | undefined, transport: Transport = fetch) {
    this.baseUrl = serverUrl(baseUrl);
    this.transport = transport;
  }

  trustedUrl(value: string): string {
    const target = new URL(value, `${this.baseUrl}/`);
    if (
      !target.href.startsWith(`${this.baseUrl}/`) ||
      target.username ||
      target.password ||
      target.hash
    ) {
      throw new NextcloudError('Nextcloud returned an unexpected destination', 502);
    }
    return target.href;
  }

  /** The fixed administrator URL is the only destination; redirects never receive credentials. */
  async request(
    url: string,
    options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
    credentials?: Pick<NextcloudCredentials, 'loginName' | 'appPassword'>,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.transport(this.trustedUrl(url), {
        ...options,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'Roko Nextcloud',
          ...options.headers,
          ...(credentials
            ? {
                Authorization: `Basic ${Buffer.from(`${credentials.loginName}:${credentials.appPassword}`).toString('base64')}`,
              }
            : {}),
        },
      });
    } catch {
      throw new NextcloudError('Nextcloud could not be reached', 502);
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new NextcloudError(
        'Nextcloud redirects are not accepted; configure its canonical URL',
        502,
      );
    }
    return response;
  }

  async checked(response: Response): Promise<Response> {
    if (response.ok) {
      return response;
    }
    await response.body?.cancel();
    const status = [401, 403, 404, 409, 412, 423, 507].includes(response.status)
      ? response.status
      : 502;
    throw new NextcloudError(`Nextcloud returned HTTP ${status}`, status);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the JSON shape is validated by each caller
  async json(response: Response): Promise<any> {
    await this.checked(response);
    try {
      return JSON.parse((await boundedBody(response, MAX_LIST_BYTES)).toString('utf8'));
    } catch (error) {
      if (error instanceof NextcloudError) {
        throw error;
      }
      throw new NextcloudError('Nextcloud returned invalid JSON', 502);
    }
  }

  async startLogin(): Promise<NextcloudLoginFlow & { login: string }> {
    const result = await this.json(
      await this.request(`${this.baseUrl}/index.php/login/v2`, { method: 'POST' }),
    );
    if (
      typeof result.poll?.token !== 'string' ||
      !result.poll.token ||
      typeof result.login !== 'string' ||
      typeof result.poll.endpoint !== 'string'
    ) {
      throw new NextcloudError('Nextcloud returned an invalid login flow', 502);
    }
    return {
      login: this.trustedUrl(result.login),
      token: result.poll.token,
      endpoint: this.trustedUrl(result.poll.endpoint),
    };
  }

  async pollLogin(flow: NextcloudLoginFlow): Promise<NextcloudAccountInfo | null> {
    const response = await this.request(flow.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: flow.token }).toString(),
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    const result = await this.json(response);
    if (
      serverUrl(result.server) !== this.baseUrl ||
      typeof result.loginName !== 'string' ||
      !result.loginName ||
      typeof result.appPassword !== 'string' ||
      !result.appPassword
    ) {
      throw new NextcloudError('Nextcloud returned invalid credentials', 502);
    }
    const credentials = { loginName: result.loginName, appPassword: result.appPassword };
    const account = await this.json(
      await this.request(
        `${this.baseUrl}/ocs/v2.php/cloud/user?format=json`,
        { headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' } },
        credentials,
      ),
    );
    const uid = account.ocs?.data?.id;
    if (
      typeof uid !== 'string' ||
      !uid ||
      // eslint-disable-next-line no-control-regex -- intencionado: rechaza separadores y caracteres de control en el identificador
      /[\\/\x00-\x1f]/.test(uid) ||
      ['.', '..'].includes(uid)
    ) {
      throw new NextcloudError('Nextcloud user identity is unavailable', 502);
    }
    return {
      ...credentials,
      uid,
      displayName: account.ocs.data.displayname || account.ocs.data.displayName || result.loginName,
    };
  }

  root(credentials: Pick<NextcloudCredentials, 'uid'>): string {
    return `${this.baseUrl}/remote.php/dav/files/${encodeURIComponent(credentials.uid)}/`;
  }

  url(credentials: Pick<NextcloudCredentials, 'uid'>, path = ''): string {
    return (
      this.root(credentials) + filePath(path, true).split('/').map(encodeURIComponent).join('/')
    );
  }

  /**
   * Lists one folder. An entry whose name cannot be represented safely (control characters,
   * backslashes, a literal `%41`-style sequence, a malformed encoding) is skipped and counted, so a
   * single odd file no longer makes the whole folder unreadable. An entry outside the user's root is
   * still an error: that is a server misbehaving, not an odd name.
   */
  async list(credentials: NextcloudCredentials, path = ''): Promise<NextcloudListing> {
    const normalized = filePath(path, true);
    const response = await this.checked(
      await this.request(
        this.url(credentials, normalized),
        {
          method: 'PROPFIND',
          headers: { Depth: '1', 'Content-Type': 'application/xml' },
          body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getetag/><d:resourcetype/></d:prop></d:propfind>',
        },
        credentials,
      ),
    );
    const xml = (await boundedBody(response, MAX_LIST_BYTES)).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
      throw new NextcloudError('Invalid Nextcloud directory response', 502);
    }
    const parsed = new XMLParser({ removeNSPrefix: true, parseTagValue: false }).parse(xml);
    if (!parsed.multistatus) {
      throw new NextcloudError('Invalid Nextcloud directory response', 502);
    }
    const responses: DavResponse | DavResponse[] = parsed.multistatus.response ?? [];
    const entries: NextcloudEntry[] = [];
    let skipped = 0;
    const root = new URL(this.root(credentials));
    const decodedRoot = decodeURIComponent(root.pathname);
    for (const item of Array.isArray(responses) ? responses : [responses]) {
      const href = new URL(item.href, `${this.baseUrl}/`);
      if (href.origin !== root.origin) {
        throw new NextcloudError('Nextcloud returned a path outside the user root', 502);
      }
      let decodedHref: string;
      try {
        decodedHref = decodeURIComponent(href.pathname);
      } catch {
        skipped += 1;
        continue;
      }
      if (!decodedHref.startsWith(decodedRoot)) {
        throw new NextcloudError('Nextcloud returned a path outside the user root', 502);
      }
      let relative: string;
      try {
        relative = filePath(decodedHref.slice(decodedRoot.length), true);
      } catch {
        skipped += 1;
        continue;
      }
      if (relative === normalized) {
        continue;
      }
      const parent = relative.split('/').slice(0, -1).join('/');
      if (parent !== normalized) {
        throw new NextcloudError('Unexpected directory depth', 502);
      }
      const statuses = Array.isArray(item.propstat) ? item.propstat : [item.propstat];
      const properties = statuses.find((entry) => /\s200\s/.test(entry?.status ?? ''))?.prop;
      if (!properties) {
        continue;
      }
      const resourceType = properties.resourcetype;
      const hasCollectionMarker =
        resourceType != null &&
        typeof resourceType === 'object' &&
        Object.prototype.hasOwnProperty.call(resourceType, 'collection');
      entries.push({
        path: relative,
        name: relative.split('/').pop() as string,
        directory: hasCollectionMarker || href.pathname.endsWith('/'),
        bytes: Number(properties.getcontentlength) || 0,
        etag: (properties.getetag as string) || '',
      });
    }
    return { entries, skipped };
  }

  async read(
    credentials: NextcloudCredentials,
    path: string,
    limit: number = MAX_FILE_BYTES,
  ): Promise<{ buffer: Buffer; etag: string; contentType: string }> {
    const response = await this.checked(
      await this.request(
        this.url(credentials, filePath(path)),
        {},
        credentials,
        limit > MAX_FILE_BYTES ? FILE_DOWNLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
      ),
    );
    return {
      buffer: await boundedBody(response, limit),
      etag: response.headers.get('etag') || '',
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  async write(
    credentials: NextcloudCredentials,
    path: string,
    buffer: Buffer,
    contentType: string,
    etag?: string | null,
  ): Promise<void> {
    const writable = assertWritablePath(path);
    if (buffer.length > MAX_FILE_BYTES) {
      throw new NextcloudError('File exceeds 8 MiB', 413);
    }
    if (etag && !/^"[^\r\n"]*"$/.test(etag)) {
      throw new NextcloudError('A strong ETag is required to replace a file');
    }
    const response = await this.checked(
      await this.request(
        this.url(credentials, filePath(writable)),
        {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }),
          },
          body: buffer as unknown as BodyInit,
        },
        credentials,
      ),
    );
    await response.body?.cancel();
  }

  async revoke(credentials: NextcloudCredentials): Promise<void> {
    const response = await this.checked(
      await this.request(
        `${this.baseUrl}/ocs/v2.php/core/apppassword`,
        { method: 'DELETE', headers: { 'OCS-APIRequest': 'true' } },
        credentials,
      ),
    );
    await response.body?.cancel();
  }
}
