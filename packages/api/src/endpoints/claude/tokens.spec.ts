import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CONSTANTS } from '~/mcp/enum';
import {
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
  ACCESS_TOKEN_IDENTIFIER,
  REFRESH_TOKEN_IDENTIFIER,
} from './constants';

type DataSchemas = typeof import('@librechat/data-schemas');
type TokensModule = typeof import('./tokens');

const USER_ID = CONSTANTS.SYSTEM_USER_ID;

let mongoServer: MongoMemoryServer;
let methods: ReturnType<DataSchemas['createTokenMethods']>;
let decryptV2: DataSchemas['decryptV2'];
let saveCredentials: TokensModule['saveCredentials'];
let clearCredentials: TokensModule['clearCredentials'];
let getValidAccessToken: TokensModule['getValidAccessToken'];
let ClaudeAuthError: TokensModule['ClaudeAuthError'];

beforeAll(async () => {
  /** Set encryption keys BEFORE importing modules that read them at load time. */
  process.env.CREDS_KEY =
    process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.CREDS_IV = process.env.CREDS_IV ?? '0123456789abcdef0123456789abcdef';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const ds = await import('@librechat/data-schemas');
  decryptV2 = ds.decryptV2;
  if (!mongoose.models.Token) {
    mongoose.model('Token', ds.tokenSchema);
  }
  methods = ds.createTokenMethods(mongoose);

  ({ saveCredentials, clearCredentials, getValidAccessToken, ClaudeAuthError } = await import(
    './tokens'
  ));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  jest.restoreAllMocks();
});

describe('claude/tokens', () => {
  it('saves access + refresh tokens as separate encrypted docs', async () => {
    await saveCredentials(
      { access_token: 'sk-ant-oat01-access', refresh_token: 'refresh-1', expires_in: 3600 },
      Date.now(),
    );

    const accessDoc = await methods.findToken({
      userId: USER_ID,
      type: ACCESS_TOKEN_TYPE,
      identifier: ACCESS_TOKEN_IDENTIFIER,
    });
    const refreshDoc = await methods.findToken({
      userId: USER_ID,
      type: REFRESH_TOKEN_TYPE,
      identifier: REFRESH_TOKEN_IDENTIFIER,
    });

    expect(accessDoc?.token).not.toBe('sk-ant-oat01-access');
    expect(await decryptV2(accessDoc!.token)).toBe('sk-ant-oat01-access');
    expect(await decryptV2(refreshDoc!.token)).toBe('refresh-1');
  });

  it('keeps the refresh doc long-lived while the access doc tracks token expiry', async () => {
    const now = Date.now();
    await saveCredentials({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, now);
    const accessDoc = await methods.findToken({
      userId: USER_ID,
      identifier: ACCESS_TOKEN_IDENTIFIER,
    });
    const refreshDoc = await methods.findToken({
      userId: USER_ID,
      identifier: REFRESH_TOKEN_IDENTIFIER,
    });

    const accessTtlMs = accessDoc!.expiresAt.getTime() - now;
    const refreshTtlMs = refreshDoc!.expiresAt.getTime() - now;
    expect(accessTtlMs).toBeLessThanOrEqual(3600 * 1000 + 1000);
    expect(refreshTtlMs).toBeGreaterThan(accessTtlMs);
    expect(refreshTtlMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });

  it('returns the stored token without refreshing when not near expiry', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await saveCredentials(
      { access_token: 'fresh', refresh_token: 'r', expires_in: 3600 },
      Date.now(),
    );
    expect(await getValidAccessToken()).toBe('fresh');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when the access token is within the leeway window', async () => {
    const now = Date.now();
    await saveCredentials({ access_token: 'old', refresh_token: 'r', expires_in: 60 }, now);

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    expect(await getValidAccessToken(now)).toBe('new-access');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const refreshDoc = await methods.findToken({
      userId: USER_ID,
      identifier: REFRESH_TOKEN_IDENTIFIER,
    });
    expect(await decryptV2(refreshDoc!.token)).toBe('new-refresh');
  });

  it('de-dupes concurrent refreshes into a single token call', async () => {
    const now = Date.now();
    await saveCredentials({ access_token: 'old', refresh_token: 'r', expires_in: 60 }, now);

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify({ access_token: 'new-access', expires_in: 3600 }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                }),
              ),
            20,
          ),
        ),
    );

    const results = await Promise.all([
      getValidAccessToken(now),
      getValidAccessToken(now),
      getValidAccessToken(now),
    ]);
    expect(results).toEqual(['new-access', 'new-access', 'new-access']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws ClaudeAuthError when no credentials are stored', async () => {
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(ClaudeAuthError);
  });

  it('clears stored credentials', async () => {
    await saveCredentials({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, Date.now());
    await clearCredentials();
    expect(
      await methods.findToken({ userId: USER_ID, identifier: ACCESS_TOKEN_IDENTIFIER }),
    ).toBeNull();
    expect(
      await methods.findToken({ userId: USER_ID, identifier: REFRESH_TOKEN_IDENTIFIER }),
    ).toBeNull();
  });
});
