const { XMLParser, XMLValidator } = require('fast-xml-parser');

// Encrypted proposal bodies must fit in a MongoDB document, including base64 overhead.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
// Matches this deployment's serverFileSizeLimit; endpoint-specific upload caps can be lower.
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_LIST_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const FILE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

class NextcloudError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function serverUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new NextcloudError('Nextcloud is not configured', 503); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new NextcloudError('Invalid Nextcloud server configuration', 503);
  }
  return url.href.replace(/\/+$/, '');
}

/** Paths are decoded, user-root-relative names, never URLs or DAV hrefs. */
function filePath(value = '', allowRoot = false) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\x00-\x1f\x7f]/.test(value)) {
    throw new NextcloudError('Invalid Nextcloud path');
  }
  const segments = value.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.some((segment) => ['.', '..'].includes(segment) || /%[0-9a-f]{2}/i.test(segment))) {
    throw new NextcloudError('Use a decoded path without traversal');
  }
  const normalized = segments.filter(Boolean).join('/');
  if (!normalized && !allowRoot) throw new NextcloudError('A file path is required');
  return normalized;
}

function isReadOnlyPath(value) {
  const normalized = filePath(value, true);
  return normalized.split('/')[0]?.toLowerCase() === 'backups';
}

function assertWritablePath(value) {
  const normalized = filePath(value);
  if (isReadOnlyPath(normalized)) {
    throw new NextcloudError('The /backups folder is read-only', 403);
  }
  return normalized;
}

async function boundedBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new NextcloudError('Nextcloud response exceeds the size limit', 413);
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body ?? []) {
    length += chunk.length;
    if (length > limit) {
      throw new NextcloudError('Nextcloud response exceeds the size limit', 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** @typedef {{loginName: string, appPassword: string, uid: string}} NextcloudCredentials */

class NextcloudWebDAV {
  /** @param {string} baseUrl @param {typeof fetch} transport */
  constructor(baseUrl, transport = fetch) {
    this.baseUrl = serverUrl(baseUrl);
    this.transport = transport;
  }

  trustedUrl(value) {
    const target = new URL(value, `${this.baseUrl}/`);
    if (!target.href.startsWith(`${this.baseUrl}/`) || target.username || target.password || target.hash) {
      throw new NextcloudError('Nextcloud returned an unexpected destination', 502);
    }
    return target.href;
  }

  /** The fixed administrator URL is the only destination; redirects never receive credentials. */
  async request(url, options = {}, credentials, timeoutMs = REQUEST_TIMEOUT_MS) {
    let response;
    try {
      response = await this.transport(this.trustedUrl(url), {
        ...options,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'Roko Nextcloud',
          ...options.headers,
          ...(credentials ? { Authorization: `Basic ${Buffer.from(`${credentials.loginName}:${credentials.appPassword}`).toString('base64')}` } : {}),
        },
      });
    } catch {
      throw new NextcloudError('Nextcloud could not be reached', 502);
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new NextcloudError('Nextcloud redirects are not accepted; configure its canonical URL', 502);
    }
    return response;
  }

  async checked(response) {
    if (response.ok) return response;
    await response.body?.cancel();
    const status = [401, 403, 404, 409, 412, 423, 507].includes(response.status) ? response.status : 502;
    throw new NextcloudError(`Nextcloud returned HTTP ${status}`, status);
  }

  async json(response) {
    await this.checked(response);
    try { return JSON.parse((await boundedBody(response, MAX_LIST_BYTES)).toString('utf8')); }
    catch (error) {
      if (error instanceof NextcloudError) throw error;
      throw new NextcloudError('Nextcloud returned invalid JSON', 502);
    }
  }

  async startLogin() {
    const result = await this.json(await this.request(`${this.baseUrl}/index.php/login/v2`, { method: 'POST' }));
    if (typeof result.poll?.token !== 'string' || !result.poll.token || typeof result.login !== 'string' || typeof result.poll.endpoint !== 'string') {
      throw new NextcloudError('Nextcloud returned an invalid login flow', 502);
    }
    return { login: this.trustedUrl(result.login), token: result.poll.token, endpoint: this.trustedUrl(result.poll.endpoint) };
  }

  async pollLogin(flow) {
    const response = await this.request(flow.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: flow.token }).toString(),
    });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    const result = await this.json(response);
    if (serverUrl(result.server) !== this.baseUrl || typeof result.loginName !== 'string' || !result.loginName || typeof result.appPassword !== 'string' || !result.appPassword) {
      throw new NextcloudError('Nextcloud returned invalid credentials', 502);
    }
    const credentials = { loginName: result.loginName, appPassword: result.appPassword };
    const account = await this.json(await this.request(`${this.baseUrl}/ocs/v2.php/cloud/user?format=json`, {
      headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' },
    }, credentials));
    const uid = account.ocs?.data?.id;
    if (typeof uid !== 'string' || !uid || /[\\/\x00-\x1f]/.test(uid) || ['.', '..'].includes(uid)) {
      throw new NextcloudError('Nextcloud user identity is unavailable', 502);
    }
    return { ...credentials, uid, displayName: account.ocs.data.displayname || account.ocs.data.displayName || result.loginName };
  }

  root(credentials) {
    return `${this.baseUrl}/remote.php/dav/files/${encodeURIComponent(credentials.uid)}/`;
  }

  url(credentials, path = '') {
    return this.root(credentials) + filePath(path, true).split('/').map(encodeURIComponent).join('/');
  }

  /** @returns {Promise<import('librechat-data-provider').NextcloudEntry[]>} */
  async list(credentials, path = '') {
    const normalized = filePath(path, true);
    const response = await this.checked(await this.request(this.url(credentials, normalized), {
      method: 'PROPFIND',
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getetag/><d:resourcetype/></d:prop></d:propfind>',
    }, credentials));
    const xml = (await boundedBody(response, MAX_LIST_BYTES)).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
      throw new NextcloudError('Invalid Nextcloud directory response', 502);
    }
    const parsed = new XMLParser({ removeNSPrefix: true, parseTagValue: false }).parse(xml);
    if (!parsed.multistatus) throw new NextcloudError('Invalid Nextcloud directory response', 502);
    const responses = parsed.multistatus.response ?? [];
    const entries = [];
    for (const item of Array.isArray(responses) ? responses : [responses]) {
      const href = new URL(item.href, `${this.baseUrl}/`);
      const root = new URL(this.root(credentials));
      const decodedRoot = decodeURIComponent(root.pathname);
      const decodedHref = decodeURIComponent(href.pathname);
      if (href.origin !== root.origin || !decodedHref.startsWith(decodedRoot)) {
        throw new NextcloudError('Nextcloud returned a path outside the user root', 502);
      }
      const relative = filePath(decodedHref.slice(decodedRoot.length), true);
      if (relative === normalized) continue;
      const parent = relative.split('/').slice(0, -1).join('/');
      if (parent !== normalized) throw new NextcloudError('Unexpected directory depth', 502);
      const statuses = Array.isArray(item.propstat) ? item.propstat : [item.propstat];
      const properties = statuses.find((entry) => /\s200\s/.test(entry?.status))?.prop;
      if (!properties) continue;
      const resourceType = properties.resourcetype;
      const hasCollectionMarker = resourceType != null && typeof resourceType === 'object'
        && Object.prototype.hasOwnProperty.call(resourceType, 'collection');
      entries.push({
        path: relative,
        name: relative.split('/').pop(),
        directory: hasCollectionMarker || href.pathname.endsWith('/'),
        bytes: Number(properties.getcontentlength) || 0,
        etag: properties.getetag || '',
      });
    }
    return entries;
  }

  async read(credentials, path, limit = MAX_FILE_BYTES) {
    const response = await this.checked(await this.request(
      this.url(credentials, filePath(path)), {}, credentials, limit > MAX_FILE_BYTES ? FILE_DOWNLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    ));
    return { buffer: await boundedBody(response, limit), etag: response.headers.get('etag') || '', contentType: response.headers.get('content-type') || 'application/octet-stream' };
  }

  async write(credentials, path, buffer, contentType, etag) {
    path = assertWritablePath(path);
    if (buffer.length > MAX_FILE_BYTES) throw new NextcloudError('File exceeds 8 MiB', 413);
    if (etag && (!/^"[^\r\n"]*"$/.test(etag))) throw new NextcloudError('A strong ETag is required to replace a file');
    const response = await this.checked(await this.request(this.url(credentials, filePath(path)), {
      method: 'PUT',
      headers: { 'Content-Type': contentType, ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) },
      body: buffer,
    }, credentials));
    await response.body?.cancel();
  }

  async revoke(credentials) {
    const response = await this.checked(await this.request(`${this.baseUrl}/ocs/v2.php/core/apppassword`, { method: 'DELETE', headers: { 'OCS-APIRequest': 'true' } }, credentials));
    await response.body?.cancel();
  }
}

module.exports = {
  NextcloudWebDAV,
  NextcloudError,
  filePath,
  isReadOnlyPath,
  assertWritablePath,
  serverUrl,
  boundedBody,
  MAX_FILE_BYTES,
  MAX_DOWNLOAD_BYTES,
  MAX_TEXT_BYTES,
};
