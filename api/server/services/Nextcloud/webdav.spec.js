const { NextcloudWebDAV, NextcloudError, filePath, MAX_FILE_BYTES } = require('./webdav');

const credentials = { loginName: 'alice@example.com', appPassword: 'app-secret', uid: 'alice@example.com' };
const davResponse = (body) => new Response(body, { status: 207 });

describe('Nextcloud WebDAV boundary', () => {
  it.each(['../bob/file', 'a/../b', 'a\\b', 'a/%2e%2e/b', 'a\0b'])('rejects traversal and ambiguous encodings: %s', (path) => {
    expect(() => filePath(path)).toThrow(NextcloudError);
  });

  it('never follows a redirect carrying the user credential', async () => {
    const transport = jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://attacker.test/' } }));
    const dav = new NextcloudWebDAV('https://cloud.test', transport);
    await expect(dav.read(credentials, 'report.txt')).rejects.toThrow('redirects');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1].redirect).toBe('manual');
    expect(transport.mock.calls[0][0]).toBe('https://cloud.test/remote.php/dav/files/alice%40example.com/report.txt');
  });

  it('rejects login flow destinations outside the configured installation', async () => {
    const transport = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      login: 'https://attacker.test/login', poll: { endpoint: 'https://cloud.test/login/v2/poll', token: 'secret' },
    })));
    await expect(new NextcloudWebDAV('https://cloud.test', transport).startLogin()).rejects.toThrow('unexpected destination');
  });

  it('lists namespaced DAV results and decodes built-in XML entities', async () => {
    const transport = jest.fn().mockResolvedValue(davResponse(`<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:"><d:response>
      <d:href>/remote.php/dav/files/alice@example.com/report.txt</d:href>
      <d:propstat><d:prop><d:getcontentlength>7</d:getcontentlength><d:getetag>&quot;v1&quot;</d:getetag><d:resourcetype/></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`));
    const dav = new NextcloudWebDAV('https://cloud.test', transport);
    expect(await dav.list(credentials)).toEqual([{ path: 'report.txt', name: 'report.txt', directory: false, bytes: 7, etag: '"v1"' }]);
    expect(transport.mock.calls[0][1].headers.Depth).toBe('1');
  });

  it('rejects a directory entry belonging to another user', async () => {
    const transport = jest.fn().mockResolvedValue(davResponse('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/files/bob/private.txt</d:href></d:response></d:multistatus>'));
    await expect(new NextcloudWebDAV('https://cloud.test', transport).list(credentials)).rejects.toThrow('outside the user root');
  });

  it('rejects XML entity declarations', async () => {
    const transport = jest.fn().mockResolvedValue(davResponse('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><multistatus/>'));
    await expect(new NextcloudWebDAV('https://cloud.test', transport).list(credentials)).rejects.toThrow('Invalid');
  });

  it('refuses oversized downloads before buffering', async () => {
    const transport = jest.fn().mockResolvedValue(new Response('x', { headers: { 'Content-Length': String(MAX_FILE_BYTES + 1) } }));
    await expect(new NextcloudWebDAV('https://cloud.test', transport).read(credentials, 'big.bin')).rejects.toMatchObject({ status: 413 });
  });

  it('uses an atomic create precondition or the exact original ETag', async () => {
    const transport = jest.fn().mockImplementation(async () => new Response(null, { status: 204 }));
    const dav = new NextcloudWebDAV('https://cloud.test', transport);
    await dav.write(credentials, 'copy.txt', Buffer.from('copy'), 'text/plain');
    expect(transport.mock.calls[0][1].headers['If-None-Match']).toBe('*');
    await dav.write(credentials, 'original.txt', Buffer.from('edit'), 'text/plain', '"v1"');
    expect(transport.mock.calls[1][1].headers['If-Match']).toBe('"v1"');
    await expect(dav.write(credentials, 'original.txt', Buffer.from('edit'), 'text/plain', 'W/"weak"')).rejects.toThrow('strong ETag');
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
