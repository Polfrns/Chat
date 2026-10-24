const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { randomBytes, createHash } = require('crypto');
const { getTenantId } = require('@librechat/data-schemas');
const { shouldUseSecureCookie, getBasePath } = require('@librechat/api');
const { SystemRoles } = require('librechat-data-provider');
const { findUser, getUserById, createUser } = require('~/models');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { getAppConfig } = require('~/server/services/Config');
const { loginLimiter, checkBan } = require('~/server/middleware');
const { getNextcloudService } = require('~/server/services/Nextcloud/service');
const { NextcloudError } = require('~/server/services/Nextcloud/webdav');
const { AccountIdentity, LoginAttempt, seal, unseal } = require('~/server/services/Nextcloud/store');

const router = express.Router();
const COOKIE = 'roko_nextcloud_login';
const LOGIN_TTL_MS = 20 * 60 * 1000;
const AUTH_USER_PROJECTION = '-password -__v -totpSecret -backupCodes -pendingTotpSecret -pendingBackupCodes -federatedTokens';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const cookieOptions = () => ({ httpOnly: true, secure: shouldUseSecureCookie(), sameSite: 'strict', path: `${getBasePath()}/api/auth/nextcloud`, maxAge: LOGIN_TTL_MS });

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!process.env.NEXTCLOUD_URL || process.env.NEXTCLOUD_LOGIN_ENABLED === 'false') return res.sendStatus(404);
  // Bind login initiation to this browser, preventing login-CSRF through posted forms.
  if (req.headers.origin) {
    try {
      if (req.headers.origin !== new URL(process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER).origin) return res.sendStatus(403);
    } catch { return res.sendStatus(403); }
  }
  next();
});

const safeRoute = (action) => async (req, res) => {
  try { await action(req, res); }
  catch (error) { res.status(error instanceof NextcloudError ? error.status : 500).json({ error: error instanceof NextcloudError ? error.message : 'Nextcloud sign-in failed' }); }
};

router.post('/start', loginLimiter, safeRoute(async (req, res) => {
  const service = getNextcloudService();
  const nonce = randomBytes(32).toString('hex');
  const flow = await service.dav.startLogin();
  const tenantId = String(getTenantId() ?? '');
  if (req.cookies?.[COOKIE]) await LoginAttempt.deleteMany({ nonce: hash(req.cookies[COOKIE]), tenantId });
  await LoginAttempt.create({ nonce: hash(nonce), tenantId, flow: await seal(flow), expiresAt: new Date(Date.now() + LOGIN_TTL_MS) });
  res.cookie(COOKIE, nonce, cookieOptions());
  res.json({ login: flow.login });
}));

router.post('/poll', rateLimit({ windowMs: 60000, limit: 60 }), safeRoute(async (req, res) => {
  const nonce = req.cookies?.[COOKIE];
  if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw new NextcloudError('Start Nextcloud sign-in again', 401);
  const tenantId = String(getTenantId() ?? '');
  const attempt = await LoginAttempt.findOneAndUpdate({ nonce: hash(nonce), tenantId,
    expiresAt: { $gt: new Date() }, pollingUntil: { $lt: new Date() },
  }, { $set: { pollingUntil: new Date(Date.now() + 60000) } }, { new: true }).lean();
  if (!attempt) return res.json({ connected: false });
  try {
    const service = getNextcloudService();
    const credentials = await service.dav.pollLogin(await unseal(attempt.flow));
    if (!credentials) return res.json({ connected: false });
    // Consume the browser-bound flow before provisioning or issuing any session.
    await LoginAttempt.deleteOne({ _id: attempt._id });
    res.clearCookie(COOKIE, cookieOptions());
    const linked = await AccountIdentity.findOne({ server: service.dav.baseUrl, uid: credentials.uid, tenantId }).lean();
    let user = linked ? await getUserById(linked.owner, AUTH_USER_PROJECTION) : null;
    if (linked && !user) throw new NextcloudError('The linked Roko account is unavailable', 403);
    if (!linked) {
      const externalId = hash(JSON.stringify([service.dav.baseUrl, tenantId, credentials.uid]));
      // A stable internal address avoids merging accounts on an unverified email claim.
      const email = `${externalId}@nextcloud.invalid`;
      user = await findUser({ email, provider: 'nextcloud' }, AUTH_USER_PROJECTION);
      if (!user) {
        if (process.env.NEXTCLOUD_AUTO_REGISTER === 'false') throw new NextcloudError('Sign in to your existing Roko account and link Nextcloud first', 403);
        const appConfig = await getAppConfig(tenantId ? { tenantId } : {});
        try {
          user = await createUser({ email, emailVerified: true, provider: 'nextcloud', name: credentials.displayName,
            username: credentials.uid, role: SystemRoles.USER, ...(tenantId ? { tenantId } : {}) }, appConfig?.balance, true, true);
        } catch (error) {
          if (error.code !== 11000) throw error;
          user = await findUser({ email, provider: 'nextcloud' }, AUTH_USER_PROJECTION);
          if (!user) throw new NextcloudError('Could not provision the Nextcloud account', 409);
        }
      }
    }
    req.user = { ...user, id: String(user._id) };
    await checkBan(req, res, async () => {
      await service.connect({ owner: String(user._id), tenantId }, credentials);
      await loginController(req, res);
    });
  } finally {
    await LoginAttempt.updateOne({ _id: attempt._id }, { $set: { pollingUntil: new Date(0) } });
  }
}));

module.exports = router;
