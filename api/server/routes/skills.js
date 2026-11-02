const path = require('path');
const multer = require('multer');
const express = require('express');
const {
  createImportHandler,
  createSkillUploadHandler,
  getStorageMetadata,
  skillDeletionRequests,
  resolveRequestTenantId,
  restoreTenantContextFromReq,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { PermissionBits, FileContext, mergeFileConfig } = require('librechat-data-provider');
const {
  createSkill,
  getSkillById,
  deleteSkill,
  upsertSkillFile,
  getSkillFileByPath,
} = require('~/models');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const { grantPermission } = require('~/server/services/PermissionService');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');
const { maybeRunGitHubSkillSyncForRequest } = require('~/server/services/Skills/sync');
const {
  checkSkillAccess,
  checkSkillCreate,
  skillHandlers: handlers,
  skillCrudChains,
} = require('~/server/services/Skills/crud');
const configMiddleware = require('~/server/middleware/config/app');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer: memory storage for skill imports (zip processed in-memory)
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.md', '.zip', '.skill']);
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB

const memoryStorage = multer.memoryStorage();

function getSkillImportSizeLimit(req) {
  const fileConfig = mergeFileConfig(req.config?.fileConfig);
  return fileConfig.skills?.fileSizeLimit ?? MAX_IMPORT_SIZE;
}

const skillImportFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    // N.B. The error handler at the bottom of this file matches this "Only " prefix.
    cb(new Error('Only .md, .zip, and .skill files are allowed'), false);
  }
};

const skillUpload = (req, res, next) =>
  multer({
    storage: memoryStorage,
    fileFilter: skillImportFilter,
    limits: { fileSize: getSkillImportSizeLimit(req) },
  }).single('file')(req, res, next);

// Per-file upload (for adding individual files to an existing skill)
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const singleFileUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_SINGLE_FILE_SIZE },
});

// ---------------------------------------------------------------------------
// Rate limiters (reuse existing file upload limiters)
// ---------------------------------------------------------------------------
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkSkillAccess);

// ---------------------------------------------------------------------------
// File storage helper: resolve the active strategy's saveBuffer
// ---------------------------------------------------------------------------
function resolveSkillStorage(req, { isImage = false } = {}) {
  const source = getFileStrategy(req.config, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { saveBuffer: strategy.saveBuffer, source };
}

// ---------------------------------------------------------------------------
// Import handler (zip/md/skill → create skill + files)
// ---------------------------------------------------------------------------
const importHandler = createImportHandler({
  limits: (req) => ({
    maxZipBytes: getSkillImportSizeLimit(req),
  }),
  createSkill,
  getSkillById,
  deleteSkill,
  upsertSkillFile,
  saveBuffer: (req, { userId, buffer, fileName, basePath, isImage, tenantId }) => {
    const requestTenantId = tenantId ?? resolveRequestTenantId(req);
    const storage = resolveSkillStorage(req, { isImage });
    return storage
      .saveBuffer({ userId, buffer, fileName, basePath, tenantId: requestTenantId })
      .then((filepath) => ({
        filepath,
        source: storage.source,
        ...getStorageMetadata({ filepath, source: storage.source }),
      }));
  },
  deleteFile: (req, file) => {
    const { deleteFile } = getStrategyFunctions(file.source);
    if (deleteFile) {
      return deleteFile(req, file);
    }
    return Promise.resolve();
  },
  grantPermission,
});

// ---------------------------------------------------------------------------
// Per-file upload handler (add a single file to an existing skill)
// ---------------------------------------------------------------------------
const uploadFileHandler = createSkillUploadHandler({
  getSkillById,
  getSkillFileByPath,
  upsertSkillFile,
  resolveStorage: resolveSkillStorage,
  getStrategyFunctions,
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function maybeStartRequestSkillSync(req, _res, next) {
  try {
    await maybeRunGitHubSkillSyncForRequest(req);
  } catch (error) {
    logger.error('[GET /skills] Failed to start request-scoped skill sync:', error);
  }
  next();
}

// Import: accepts .md / .zip / .skill via multipart
router.post(
  '/import',
  checkSkillCreate,
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  skillUpload,
  restoreTenantContextFromReq,
  importHandler,
);

router.get('/', maybeStartRequestSkillSync, ...skillCrudChains.list);
router.post('/', ...skillCrudChains.create);

// Deletions requested by the chat `skill_library` tool wait here for the user's
// popup decision. Registered before `/:id` so the path is not read as a skill id.
router.get('/deletion-requests', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ requests: await skillDeletionRequests.list(req.user.id) });
});
router.post('/deletion-requests/:requestId/decision', async (req, res) => {
  if (typeof req.body?.approve !== 'boolean') {
    return res.status(400).json({ error: 'An explicit decision is required' });
  }
  const decided = await skillDeletionRequests.decide(
    req.user.id,
    req.params.requestId,
    req.body.approve ? 'approve' : 'deny',
  );
  return decided
    ? res.json({ status: req.body.approve ? 'approved' : 'denied' })
    : res.status(404).json({ error: 'Deletion request not found or expired' });
});

router.get('/:id', ...skillCrudChains.get);
router.patch('/:id', ...skillCrudChains.patch);
router.delete('/:id', ...skillCrudChains.remove);

router.get(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.listFiles,
);

// Legacy upload and revision-checked editing. Older servers have no POST wildcard route.
router.post(
  ['/:id/files', '/:id/files/*relativePath'],
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  singleFileUpload.single('file'),
  restoreTenantContextFromReq,
  uploadFileHandler,
);

// Wildcard splat (`*relativePath`) captures nested skill paths (e.g.
// `references/guide.md`) whether the client sends an encoded `%2F` or a proxy
// has already decoded it to a literal slash. A single `:relativePath` segment
// 404s in the latter case, which is why nested files failed behind proxies.
router.get(
  '/:id/files/*relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.downloadFile,
);

router.delete(
  '/:id/files/*relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.deleteFile,
);

// Multer + file-filter error handler — surface as 400, forward everything else

router.use((err, _req, res, next) => {
  if (err && (err.name === 'MulterError' || err.message?.startsWith('Only '))) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
