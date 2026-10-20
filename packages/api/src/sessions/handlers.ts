import { logger } from '@librechat/data-schemas';
import type { ChatSessionMethods } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { RokoFilestore } from '../roko';
import {
  filestoreAccessRequests,
  filestoreCreationRequests,
  subscribeFilestoreRequests,
} from './requests';

const NOT_FOUND = 'Session not found';

interface SessionUser {
  id: string;
  _id?: { toString(): string };
}

interface SessionRequest extends Request {
  user?: SessionUser;
}

/** Conversation glue (provided by the /api layer over the Conversation model). */
export interface SessionConversationDeps {
  assignChatToSession: (
    user: string,
    conversationId: string,
    sessionId: string | null,
  ) => Promise<{ conversationId: string } | null>;
  listSessionChats: (user: string, sessionId: string) => Promise<unknown[]>;
  /** Cascade-delete the session's conversations (+ their messages). */
  deleteSessionChats: (user: string, sessionId: string) => Promise<void>;
}

/** Filestore lookups, delegated to the standalone Roko service (provided by the
 *  /api layer, which owns the Roko client + tenant derivation). Both take the
 *  request so the impl can mint the caller's Roko identity. */
export interface SessionFilestoreDeps {
  /** Of `ids`, the ones the caller may actually access (validated via Roko). */
  filterAccessibleFilestoreUids: (req: Request, ids: string[]) => Promise<string[]>;
  /** Resolve a session's filestore ids to filestore records for the UI. */
  resolveSessionFilestores: (req: Request, ids: string[]) => Promise<RokoFilestore[]>;
}

type Dependencies = Pick<
  ChatSessionMethods,
  | 'createChatSession'
  | 'getChatSession'
  | 'listChatSessions'
  | 'updateChatSession'
  | 'deleteChatSession'
  | 'setSessionFilestore'
> &
  SessionConversationDeps &
  SessionFilestoreDeps;

type Handler = (req: SessionRequest, res: Response) => Promise<Response>;

export interface SessionHandlers {
  listSessions: Handler;
  createSession: Handler;
  getSession: Handler;
  updateSession: Handler;
  deleteSession: Handler;
  attachFilestore: Handler;
  detachFilestore: Handler;
  listSessionFilestores: Handler;
  listSessionChats: Handler;
  assignChat: Handler;
  listFilestoreAccessRequests: Handler;
  decideFilestoreAccessRequest: Handler;
  streamFilestoreRequests: (req: SessionRequest, res: Response) => Promise<void>;
}

const getUserId = (req: SessionRequest): string => req.user?.id ?? req.user?._id?.toString() ?? '';
/** Flush through compression middleware when present (a plain Response has none). */
const flush = (res: Response & { flush?: () => void }): void => {
  if (typeof res.flush === 'function') {
    res.flush();
  }
};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function createSessionHandlers(deps: Dependencies): SessionHandlers {
  async function listSessions(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const sessions = await deps.listChatSessions(getUserId(req), { search });
      return res.json({ sessions });
    } catch (error) {
      logger.error('[sessions] list failed', error);
      return res.status(500).json({ error: 'Failed to list sessions' });
    }
  }

  async function createSession(req: SessionRequest, res: Response): Promise<Response> {
    const name = str(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const filestoreUids = await deps.filterAccessibleFilestoreUids(
        req,
        asStringArray(req.body?.filestoreUids),
      );
      const session = await deps.createChatSession(getUserId(req), { name, filestoreUids });
      return res.status(201).json(session);
    } catch (error) {
      logger.error('[sessions] create failed', error);
      return res.status(500).json({ error: 'Failed to create session' });
    }
  }

  async function getSession(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const session = await deps.getChatSession(getUserId(req), req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      return res.json(session);
    } catch (error) {
      logger.error('[sessions] get failed', error);
      return res.status(500).json({ error: 'Failed to get session' });
    }
  }

  async function updateSession(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const input: { name?: string; filestoreUids?: string[] } = {};
      if (req.body?.name !== undefined) {
        const name = str(req.body.name);
        if (!name) {
          return res.status(400).json({ error: 'name is required' });
        }
        input.name = name;
      }
      if (req.body?.filestoreUids !== undefined) {
        input.filestoreUids = await deps.filterAccessibleFilestoreUids(
          req,
          asStringArray(req.body.filestoreUids),
        );
      }
      const session = await deps.updateChatSession(getUserId(req), req.params.sessionId, input);
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      return res.json(session);
    } catch (error) {
      logger.error('[sessions] update failed', error);
      return res.status(500).json({ error: 'Failed to update session' });
    }
  }

  async function deleteSession(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const user = getUserId(req);
      /** Conversations must always belong to a session, so deleting one cascades
       *  to its chats (and their messages) before the session doc is removed. */
      await deps.deleteSessionChats(user, req.params.sessionId);
      const result = await deps.deleteChatSession(user, req.params.sessionId);
      if (!result.deletedCount) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      return res.json(result);
    } catch (error) {
      logger.error('[sessions] delete failed', error);
      return res.status(500).json({ error: 'Failed to delete session' });
    }
  }

  async function attachFilestore(req: SessionRequest, res: Response): Promise<Response> {
    const filestoreUid = str(req.body?.filestoreUid);
    if (!filestoreUid) {
      return res.status(400).json({ error: 'filestoreUid is required' });
    }
    try {
      const allowed = await deps.filterAccessibleFilestoreUids(req, [filestoreUid]);
      if (allowed.length === 0) {
        return res.status(403).json({ error: 'Filestore not accessible' });
      }
      const session = await deps.setSessionFilestore(
        getUserId(req),
        req.params.sessionId,
        filestoreUid,
        true,
      );
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      return res.json(session);
    } catch (error) {
      logger.error('[sessions] attachFilestore failed', error);
      return res.status(500).json({ error: 'Failed to attach filestore' });
    }
  }

  async function detachFilestore(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const session = await deps.setSessionFilestore(
        getUserId(req),
        req.params.sessionId,
        req.params.filestoreUid,
        false,
      );
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      return res.json(session);
    } catch (error) {
      logger.error('[sessions] detachFilestore failed', error);
      return res.status(500).json({ error: 'Failed to detach filestore' });
    }
  }

  async function listSessionFilestores(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const session = await deps.getChatSession(getUserId(req), req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      const filestores = await deps.resolveSessionFilestores(req, session.filestoreUids);
      return res.json({ filestores });
    } catch (error) {
      logger.error('[sessions] listSessionFilestores failed', error);
      return res.status(500).json({ error: 'Failed to list session filestores' });
    }
  }

  async function listSessionChats(req: SessionRequest, res: Response): Promise<Response> {
    try {
      const session = await deps.getChatSession(getUserId(req), req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      const chats = await deps.listSessionChats(getUserId(req), req.params.sessionId);
      return res.json({ chats });
    } catch (error) {
      logger.error('[sessions] listSessionChats failed', error);
      return res.status(500).json({ error: 'Failed to list session chats' });
    }
  }

  async function assignChat(req: SessionRequest, res: Response): Promise<Response> {
    const sessionId = req.body?.sessionId ?? null;
    if (sessionId !== null && typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId must be a string or null' });
    }
    try {
      const user = getUserId(req);
      if (typeof sessionId === 'string') {
        const session = await deps.getChatSession(user, sessionId);
        if (!session) {
          return res.status(404).json({ error: NOT_FOUND });
        }
      }
      const result = await deps.assignChatToSession(user, req.params.conversationId, sessionId);
      if (!result) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      return res.json(result);
    } catch (error) {
      logger.error('[sessions] assignChat failed', error);
      return res.status(500).json({ error: 'Failed to assign chat to session' });
    }
  }

  async function listFilestoreAccessRequests(
    req: SessionRequest,
    res: Response,
  ): Promise<Response> {
    try {
      const session = await deps.getChatSession(getUserId(req), req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      return res.json({
        requests: await filestoreAccessRequests.listRequests(req.params.sessionId),
      });
    } catch (error) {
      logger.error('[sessions] listFilestoreAccessRequests failed', error);
      return res.status(500).json({ error: 'Failed to list access requests' });
    }
  }

  async function decideFilestoreAccessRequest(
    req: SessionRequest,
    res: Response,
  ): Promise<Response> {
    const { sessionId, filestoreUid, decision } = req.params;
    if (decision !== 'approve' && decision !== 'deny') {
      return res.status(400).json({ error: 'decision must be approve or deny' });
    }
    try {
      const user = getUserId(req);
      const existing = await deps.getChatSession(user, sessionId);
      if (!existing) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      let session = existing;
      if (decision === 'approve') {
        const allowed = await deps.filterAccessibleFilestoreUids(req, [filestoreUid]);
        if (allowed.length === 0) {
          await filestoreAccessRequests.decideRequest(sessionId, filestoreUid, 'deny');
          return res.status(403).json({ error: 'Filestore not accessible' });
        }
        session = (await deps.setSessionFilestore(user, sessionId, filestoreUid, true)) ?? existing;
      }
      await filestoreAccessRequests.decideRequest(sessionId, filestoreUid, decision);
      return res.json(session);
    } catch (error) {
      logger.error('[sessions] decideFilestoreAccessRequest failed', error);
      return res.status(500).json({ error: 'Failed to decide access request' });
    }
  }

  /** SSE stream of the session's pending access + creation requests: an initial
   *  snapshot, then a fresh snapshot whenever the notifier fires (a request is
   *  raised or resolved). Replaces the frontend's per-request polling; the client
   *  keeps a slow poll only as a backstop. */
  async function streamFilestoreRequests(req: SessionRequest, res: Response): Promise<void> {
    const sessionId = req.params.sessionId;
    const session = await deps.getChatSession(getUserId(req), sessionId);
    if (!session) {
      res.status(404).json({ error: NOT_FOUND });
      return;
    }
    res.writeHead(200, {
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });

    const send = async (): Promise<void> => {
      if (res.writableEnded) {
        return;
      }
      const [access, creation] = await Promise.all([
        filestoreAccessRequests.listRequests(sessionId),
        filestoreCreationRequests.listRequests(sessionId),
      ]);
      const payload = JSON.stringify({ accessRequests: access, creationRequests: creation });
      res.write(`event: requests\ndata: ${payload}\n\n`);
      flush(res);
    };

    const unsubscribe = subscribeFilestoreRequests(sessionId, () => {
      send().catch((error) =>
        logger.error('[sessions] streamFilestoreRequests send failed', error),
      );
    });
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        return;
      }
      res.write(': ping\n\n');
      flush(res);
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });

    await send();
  }

  return {
    listSessions,
    createSession,
    getSession,
    updateSession,
    deleteSession,
    attachFilestore,
    detachFilestore,
    listSessionFilestores,
    listSessionChats,
    assignChat,
    listFilestoreAccessRequests,
    decideFilestoreAccessRequest,
    streamFilestoreRequests,
  };
}
