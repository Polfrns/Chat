import express from 'express';
import { identityFromAuthHeader } from './auth';
import { AccessError, NotFoundError, ReadOnlyError, TraversalError, ValidationError } from './errors';
import type { Request, Response, NextFunction } from 'express';
import type { FilestoreService } from './service';
import type { Config } from './config';
import type { Filestore, Identity } from './types';

interface AuthedRequest extends Request {
  identity: Identity;
}

/** UI-facing projection — omits the internal `ref` locator. */
const toPublic = (s: Filestore) => ({
  id: s.id,
  displayName: s.displayName,
  description: s.description,
  kind: s.kind,
  readOnly: s.readOnly,
  shared: s.shared,
  owner: s.owner,
  tenant: s.tenant,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

function statusFor(error: unknown): number {
  if (error instanceof ValidationError || error instanceof TraversalError) {
    return 400;
  }
  if (error instanceof AccessError || error instanceof ReadOnlyError) {
    return 403;
  }
  if (error instanceof NotFoundError) {
    return 404;
  }
  return 500;
}

/** Run a handler and translate the result / typed failure into the response. */
async function send(res: Response, status: number, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    res.status(status).json(await fn());
  } catch (error) {
    res.status(statusFor(error)).json({ error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Management REST face — the surface UIs use to browse/CRUD file stores and read
 * the file tree. Same core (`FilestoreService`) and same bearer auth as the MCP
 * face; this one just speaks HTTP/JSON.
 */
export function createRestRouter(service: FilestoreService, config: Config): express.Router {
  const router = express.Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    const identity = identityFromAuthHeader(req.headers.authorization, config.jwtSecret);
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as AuthedRequest).identity = identity;
    next();
  });

  const who = (req: Request): Identity => (req as AuthedRequest).identity;

  router.get('/', (req, res) =>
    send(res, 200, () => ({ filestores: service.listAccessible(who(req)).map(toPublic) })),
  );

  router.post('/', (req, res) =>
    send(res, 201, async () => toPublic(await service.createFilestore(who(req), req.body ?? {}))),
  );

  router.get('/:id', (req, res) =>
    send(res, 200, () => toPublic(service.getFilestore(who(req), req.params.id))),
  );

  router.patch('/:id', (req, res) =>
    send(res, 200, () => toPublic(service.updateFilestore(who(req), req.params.id, req.body ?? {}))),
  );

  router.delete('/:id', (req, res) =>
    send(res, 200, () => service.deleteFilestore(who(req), req.params.id)),
  );

  router.get('/:id/files', (req, res) =>
    send(res, 200, async () => ({ files: await service.listFiles(who(req), req.params.id) })),
  );

  return router;
}
