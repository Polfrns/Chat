const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

jest.mock('@librechat/data-schemas', () => ({ getTenantId: jest.fn(() => 'tenant-a') }));
jest.mock('@librechat/api', () => ({ shouldUseSecureCookie: () => false, getBasePath: () => '' }));
jest.mock('~/models', () => ({ findUser: jest.fn(), getUserById: jest.fn(), createUser: jest.fn() }));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn().mockResolvedValue({}) }));
jest.mock('~/server/middleware', () => ({
  loginLimiter: (_req, _res, next) => next(),
  checkBan: async (_req, _res, next) => next(),
}));
jest.mock('~/server/controllers/auth/LoginController', () => ({
  loginController: jest.fn(async (req, res) => res.json({ token: 'roko-session', owner: req.user.id })),
}));
jest.mock('~/server/services/Nextcloud/service', () => ({ getNextcloudService: jest.fn() }));
jest.mock('~/server/services/Nextcloud/store', () => ({
  AccountIdentity: { findOne: jest.fn() },
  LoginAttempt: { create: jest.fn(), deleteMany: jest.fn(), findOneAndUpdate: jest.fn(), deleteOne: jest.fn(), updateOne: jest.fn() },
  seal: async (value) => JSON.stringify(value), unseal: async (value) => JSON.parse(value),
}));

const { getTenantId } = require('@librechat/data-schemas');
const { findUser, getUserById, createUser } = require('~/models');
const { getNextcloudService } = require('~/server/services/Nextcloud/service');
const { AccountIdentity, LoginAttempt } = require('~/server/services/Nextcloud/store');
const { loginController } = require('~/server/controllers/auth/LoginController');
const router = require('./nextcloudAuth');

describe('Nextcloud browser-bound sign-in', () => {
  const originalEnv = { ...process.env };
  let attempt;
  let service;
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTCLOUD_URL = 'https://cloud.test';
    process.env.NEXTCLOUD_LOGIN_ENABLED = 'true';
    process.env.NEXTCLOUD_AUTO_REGISTER = 'true';
    process.env.DOMAIN_CLIENT = 'http://roko.test';
    getTenantId.mockReturnValue('tenant-a');
    service = { dav: { baseUrl: 'https://cloud.test',
      startLogin: jest.fn().mockResolvedValue({ login: 'https://cloud.test/login/flow', endpoint: 'https://cloud.test/login/poll', token: 'poll-secret' }),
      pollLogin: jest.fn().mockResolvedValue({ uid: 'alice', loginName: 'alice', displayName: 'Alice', appPassword: 'private-secret' }),
    }, connect: jest.fn() };
    getNextcloudService.mockReturnValue(service);
    LoginAttempt.create.mockImplementation(async (value) => { attempt = { _id: 'flow-id', ...value }; });
    LoginAttempt.deleteOne.mockImplementation(async () => { attempt = null; });
    LoginAttempt.findOneAndUpdate.mockImplementation((query) => ({ lean: async () => attempt && query.nonce === attempt.nonce && query.tenantId === attempt.tenantId ? attempt : null }));
    AccountIdentity.findOne.mockReturnValue({ lean: async () => null });
    findUser.mockResolvedValue(null);
    createUser.mockResolvedValue({ _id: 'new-roko-user', provider: 'nextcloud' });
    app = express();
    app.use(express.json(), cookieParser());
    app.use('/api/auth/nextcloud', router);
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('does not poll or issue a session without the initiating browser cookie', async () => {
    await request(app).post('/api/auth/nextcloud/poll').expect(401);
    expect(service.dav.pollLogin).not.toHaveBeenCalled();
    expect(loginController).not.toHaveBeenCalled();
  });

  it('rejects cross-origin login initiation', async () => {
    await request(app).post('/api/auth/nextcloud/start').set('Origin', 'https://attacker.test').expect(403);
    expect(LoginAttempt.create).not.toHaveBeenCalled();
  });

  it('provisions a USER from verified Nextcloud identity without disclosing its app password', async () => {
    const browser = request.agent(app);
    const started = await browser.post('/api/auth/nextcloud/start').expect(200);
    expect(started.body).toEqual({ login: 'https://cloud.test/login/flow' });
    expect(JSON.stringify(started.body)).not.toContain('poll-secret');
    const response = await browser.post('/api/auth/nextcloud/poll').expect(200);
    expect(response.body).toMatchObject({ owner: 'new-roko-user' });
    expect(JSON.stringify(response.body)).not.toContain('private-secret');
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'nextcloud', role: 'USER', email: expect.stringMatching(/@nextcloud\.invalid$/) }),
      undefined,
      true,
      true,
    );
    expect(service.connect).toHaveBeenCalledWith({ owner: 'new-roko-user', tenantId: 'tenant-a' }, expect.objectContaining({ uid: 'alice' }));
    expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ provider: 'nextcloud' }), expect.stringContaining('-federatedTokens'));
  });

  it('opens the existing explicitly linked Roko account without registering another', async () => {
    AccountIdentity.findOne.mockReturnValue({ lean: async () => ({ owner: 'existing-roko-user' }) });
    getUserById.mockResolvedValue({ _id: 'existing-roko-user' });
    const browser = request.agent(app);
    await browser.post('/api/auth/nextcloud/start').expect(200);
    const response = await browser.post('/api/auth/nextcloud/poll').expect(200);
    expect(response.body.owner).toBe('existing-roko-user');
    expect(createUser).not.toHaveBeenCalled();
    expect(AccountIdentity.findOne).toHaveBeenCalledWith({ server: 'https://cloud.test', uid: 'alice', tenantId: 'tenant-a' });
  });

  it('cannot consume a flow from a different tenant', async () => {
    const browser = request.agent(app);
    await browser.post('/api/auth/nextcloud/start').expect(200);
    getTenantId.mockReturnValue('tenant-b');
    const response = await browser.post('/api/auth/nextcloud/poll').expect(200);
    expect(response.body).toEqual({ connected: false });
    expect(service.dav.pollLogin).not.toHaveBeenCalled();
    expect(loginController).not.toHaveBeenCalled();
  });
});
