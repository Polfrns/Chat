import { RokoWorkspaceClient } from './client';
import type { RokoWorkspaceIdentity } from './workspace';

const key = 'k'.repeat(40);
const config = { baseUrl: 'http://roko-workspace:8080', key };
const identity: RokoWorkspaceIdentity = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  conversationId: 'conversation-1',
};

describe('RokoWorkspaceClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs each REST request with a fresh timestamp and its conversation identity', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: 'inputs/a.txt', bytes: 1 })))
      .mockResolvedValueOnce(new Response('output'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(3000);

    const client = new RokoWorkspaceClient(config, {});
    await client.uploadInput(identity, 'a.txt', Buffer.from('a'));
    await client.downloadOutput(identity, 'outputs/a.txt');
    await client.deleteWorkspace(identity);

    expect(fetch).toHaveBeenCalledTimes(3);
    const timestamps = fetch.mock.calls.map(([, init]) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${key}`);
      expect(headers.get('x-roko-signature')).toMatch(/^[a-f0-9]{64}$/);
      const encoded = headers.get('x-roko-context');
      expect(encoded).toBeTruthy();
      return JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf8'));
    });
    expect(timestamps.map((context) => context.timestamp)).toEqual([1000, 2000, 3000]);
    expect(timestamps).toEqual([
      expect.objectContaining({ v: 1, aud: 'roko-workspace', ...identity }),
      expect.objectContaining({ v: 1, aud: 'roko-workspace', ...identity }),
      expect.objectContaining({ v: 1, aud: 'roko-workspace', ...identity }),
    ]);
  });

  it('rejects paths that could be normalized outside outputs before making a request', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    const client = new RokoWorkspaceClient(config, {});

    await expect(
      client.downloadOutput(identity, 'outputs/../inputs/private.txt'),
    ).rejects.toMatchObject({
      code: 'invalid_path',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
