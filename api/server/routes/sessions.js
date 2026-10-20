const express = require('express');
const { createSessionHandlers, filestoreCreationRequests } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { rokoClient } = require('~/server/services/roko');
const { Conversation } = require('~/db/models');
const db = require('~/models');

const router = express.Router();

/** Conversation glue over the Conversation model (1→many: conversation.sessionId). */
async function assignChatToSession(user, conversationId, sessionId) {
  const updated = await Conversation.findOneAndUpdate(
    { conversationId, user },
    { $set: { sessionId } },
    { new: true },
  ).lean();
  return updated ? { conversationId } : null;
}

async function listSessionChats(user, sessionId) {
  return Conversation.find({ user, sessionId }).sort({ updatedAt: -1 }).limit(100).lean();
}

/** Cascade-delete a session's conversations (+ messages). No-op if it has none. */
async function deleteSessionChats(user, sessionId) {
  try {
    await db.deleteConvos(user, { sessionId });
  } catch {
    /* deleteConvos throws when no conversations match — nothing to clean up */
  }
}

/** Filestore lookups go to the leedeo-filestore service (LibreChat sessions hold
 *  only opaque filestore ids). Both validate against what the service exposes. */
async function filterAccessibleFilestoreUids(req, ids) {
  const stores = await rokoClient.accessibleByUids(ids);
  return stores.map((store) => store.uid);
}

async function resolveSessionFilestores(req, ids) {
  return rokoClient.accessibleByUids(ids);
}

const handlers = createSessionHandlers({
  createChatSession: db.createChatSession,
  getChatSession: db.getChatSession,
  listChatSessions: db.listChatSessions,
  updateChatSession: db.updateChatSession,
  deleteChatSession: db.deleteChatSession,
  setSessionFilestore: db.setSessionFilestore,
  assignChatToSession,
  listSessionChats,
  deleteSessionChats,
  filterAccessibleFilestoreUids,
  resolveSessionFilestores,
});

router.use(requireJwtAuth);

router.get('/', handlers.listSessions);
router.post('/', handlers.createSession);
router.put('/chats/:conversationId', handlers.assignChat);
router.get('/:sessionId', handlers.getSession);
router.patch('/:sessionId', handlers.updateSession);
router.delete('/:sessionId', handlers.deleteSession);
router.get('/:sessionId/chats', handlers.listSessionChats);
router.get('/:sessionId/filestores', handlers.listSessionFilestores);
router.post('/:sessionId/filestores', handlers.attachFilestore);
router.delete('/:sessionId/filestores/:filestoreUid', handlers.detachFilestore);
router.get('/:sessionId/filestore-access-requests', handlers.listFilestoreAccessRequests);
router.post(
  '/:sessionId/filestore-access-requests/:filestoreUid/:decision',
  handlers.decideFilestoreAccessRequest,
);

/** SSE push of the session's pending access + creation requests (Redis pub/sub
 *  fanned out across instances), replacing the frontend's request polling. */
router.get('/:sessionId/filestore-requests/stream', handlers.streamFilestoreRequests);

/** Pending `create_filestore` proposals raised by the agent's hook — the user
 *  confirms (optionally editing) or declines, feeding the decision back to the
 *  blocked tool call. Owner-scoped via the session lookup. */
async function ownsSession(req) {
  const session = await db.getChatSession(req.user?.id, req.params.sessionId);
  return Boolean(session);
}

router.get('/:sessionId/filestore-creation-requests', async (req, res) => {
  if (!(await ownsSession(req))) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json({ requests: await filestoreCreationRequests.listRequests(req.params.sessionId) });
});

router.post('/:sessionId/filestore-creation-requests/:requestId/:decision', async (req, res) => {
  if (!(await ownsSession(req))) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const { sessionId, requestId, decision } = req.params;
  if (decision !== 'confirm' && decision !== 'decline') {
    return res.status(400).json({ error: 'decision must be confirm or decline' });
  }
  const values =
    decision === 'confirm'
      ? {
          displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : '',
          description: typeof req.body?.description === 'string' ? req.body.description : '',
          shared: req.body?.shared === true,
          readOnly: req.body?.readOnly === true,
        }
      : undefined;
  await filestoreCreationRequests.decideRequest(sessionId, requestId, decision, values);
  return res.json({ ok: true });
});

module.exports = router;
