const path = require('path');
const multer = require('multer');
const express = require('express');
const { Readable } = require('stream');
const { RokoError, moveRokoFile } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { rokoClient } = require('~/server/services/roko');
const db = require('~/models');

/** The service buffers transfers in memory and caps them at 100 MiB (413 above);
 *  the proxy enforces the same cap so oversized uploads fail before leaving here. */
const TRANSFER_MAX_BYTES = 100 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TRANSFER_MAX_BYTES },
});

const receiveUpload = (req, res, next) =>
  upload.single('file')(req, res, (error) => {
    if (!error) {
      return next();
    }
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: error.message });
  });

/**
 * Thin proxy to the leedeo-filestore service's management REST. LibreChat does
 * not own filestores; it forwards the user's request under the deployment-wide
 * API key and passes the service's `id`-keyed shape straight through.
 */
const router = express.Router();
router.use(requireJwtAuth);

const fail = (res, error) => {
  const status = error instanceof RokoError ? error.status : 500;
  res.status(status).json({ error: error?.message || 'Filestore request failed' });
};

router.get('/', async (req, res) => {
  try {
    const { filestores } = await rokoClient.listFilestores();
    res.json({ filestores });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const store = await rokoClient.createFilestore({
      displayName: req.body?.displayName,
      description: req.body?.description,
      shared: req.body?.shared === true,
      readOnly: req.body?.readOnly === true,
    });
    res.status(201).json(store);
  } catch (error) {
    fail(res, error);
  }
});

router.get('/:filestoreUid', async (req, res) => {
  try {
    res.json(await rokoClient.getFilestore(req.params.filestoreUid));
  } catch (error) {
    fail(res, error);
  }
});

router.patch('/:filestoreUid', async (req, res) => {
  try {
    const store = await rokoClient.updateFilestore(req.params.filestoreUid, {
      displayName: req.body?.displayName,
      description: req.body?.description,
      readOnly: typeof req.body?.readOnly === 'boolean' ? req.body.readOnly : undefined,
    });
    res.json(store);
  } catch (error) {
    fail(res, error);
  }
});

router.delete('/:filestoreUid', async (req, res) => {
  try {
    /** Only ephemeral stores (provisioned via LibreChat) may be deleted by users;
     *  the service 403s for registered ones, which are admin-managed fixtures. */
    const { deleted } = await rokoClient.deleteFilestore(req.params.filestoreUid);
    if (deleted) {
      /** The store is gone service-side; detach its uid from every session so it
       *  can't silently reattach if a new store reuses the same slug. */
      await db.detachFilestoreFromSessions(req.params.filestoreUid);
    }
    res.json({ deletedCount: deleted ? 1 : 0 });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/:filestoreUid/files', async (req, res) => {
  try {
    res.json(await rokoClient.listFiles(req.params.filestoreUid));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/:filestoreUid/files/upload', receiveUpload, async (req, res) => {
  try {
    const destination = typeof req.body?.path === 'string' ? req.body.path : '';
    if (!destination || !req.file) {
      res.status(400).json({ error: "'path' and 'file' are required" });
      return;
    }
    const result = await rokoClient.uploadFile(req.params.filestoreUid, destination, {
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    res.status(201).json(result);
  } catch (error) {
    fail(res, error);
  }
});

router.get('/:filestoreUid/files/download', async (req, res) => {
  try {
    const filePath = typeof req.query?.path === 'string' ? req.query.path : '';
    if (!filePath) {
      res.status(400).json({ error: "'path' is required" });
      return;
    }
    const download = await rokoClient.downloadFile(req.params.filestoreUid, filePath);
    res.setHeader('Content-Type', download.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(path.posix.basename(filePath))}"`,
    );
    if (download.contentLength !== null) {
      res.setHeader('Content-Length', download.contentLength);
    }
    Readable.fromWeb(download.stream).pipe(res);
  } catch (error) {
    fail(res, error);
  }
});

router.post('/:filestoreUid/files/move', async (req, res) => {
  try {
    const src = typeof req.body?.src === 'string' ? req.body.src : '';
    const dst = typeof req.body?.dst === 'string' ? req.body.dst : '';
    if (!src || !dst) {
      res.status(400).json({ error: "'src' and 'dst' are required" });
      return;
    }
    await moveRokoFile(rokoClient, req.params.filestoreUid, src, dst);
    res.json({ moved: true, src, dst });
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
