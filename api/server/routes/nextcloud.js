const express = require('express');
const { identity } = require('~/server/services/Nextcloud/store');
const { getNextcloudService } = require('~/server/services/Nextcloud/service');
const { NextcloudError, MAX_DOWNLOAD_BYTES } = require('~/server/services/Nextcloud/webdav');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const route = (action) => async (req, res) => {
  try { await action(req, res, getNextcloudService(), identity(req)); }
  catch (error) { res.status(error instanceof NextcloudError ? error.status : 500).json({ error: error instanceof NextcloudError ? error.message : 'Nextcloud operation failed' }); }
};

router.get('/status', async (req, res, next) => {
  if (!process.env.NEXTCLOUD_URL) return res.json({ enabled: false, connected: false });
  return route(async (_req, response, service, owner) => response.json(await service.status(owner)))(req, res, next);
});
router.post('/connect', route(async (_req, res, service, owner) => res.json(await service.startLogin(owner))));
router.post('/connect/poll', route(async (_req, res, service, owner) => res.json(await service.finishLogin(owner))));
router.delete('/connection', route(async (_req, res, service, owner) => res.json(await service.disconnect(owner))));
router.get('/files', route(async (req, res, service, owner) => {
  if (req.query.path != null && typeof req.query.path !== 'string') throw new NextcloudError('Invalid path');
  res.json({ files: await service.list(owner, req.query.path || '') });
}));
router.get('/download', route(async (req, res, service, owner) => {
  if (typeof req.query.path !== 'string') throw new NextcloudError('A path is required');
  const result = await service.read(owner, req.query.path, MAX_DOWNLOAD_BYTES);
  res.set('Content-Type', 'application/octet-stream');
  res.set('X-Nextcloud-Content-Type', result.contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(req.query.path.split('/').pop())}`);
  res.send(result.buffer);
}));
router.get('/proposals', route(async (req, res, service, owner) => {
  if (req.query.conversationId != null && typeof req.query.conversationId !== 'string') throw new NextcloudError('Invalid conversation');
  res.json({ proposals: await service.pending(owner, req.query.conversationId) });
}));
router.post('/proposals/:id/decision', route(async (req, res, service, owner) => {
  if (typeof req.body?.approve !== 'boolean') throw new NextcloudError('An explicit decision is required');
  res.json(await service.decide(owner, req.params.id, req.body.approve));
}));

module.exports = router;
