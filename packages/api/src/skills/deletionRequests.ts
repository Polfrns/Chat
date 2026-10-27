import { randomUUID } from 'crypto';
import { ioredisClient } from '../cache/redisClients';
import { createRequestNotifier, waitForNotifiedValue } from '../sessions/requests/notifier';
import { createRequestStore } from '../sessions/requests/store';

/**
 * Pending user approvals for skill deletions requested by the chat model. Keyed
 * by user, not by chat session: a skill belongs to the user's library, and the
 * only party who may approve is the authenticated owner of the request.
 */

export interface SkillDeletionProposal {
  skillId: string;
  name: string;
  description?: string;
  conversationId?: string;
}
export type SkillDeletionDecision = 'approve' | 'deny';
export interface SkillDeletionRequestView extends SkillDeletionProposal {
  requestId: string;
  requestedAt: number;
}

/** How long the blocked tool waits for the user before reporting no decision. */
export const SKILL_DELETION_TIMEOUT_MS = 120_000;
/** Slightly above the wait so entries outlive a pending decision. */
const TTL_SECONDS = 180;

const notifier = createRequestNotifier(ioredisClient, 'roko:skill-deletion-requests');
const store = createRequestStore<SkillDeletionProposal, SkillDeletionDecision, never>({
  kind: 'skill-deletion',
  redis: ioredisClient,
  notifier,
  ttlSeconds: TTL_SECONDS,
});

async function readDecision(
  userId: string,
  requestId: string,
): Promise<SkillDeletionDecision | null> {
  const entry = await store.get(userId, requestId);
  return entry && entry.status !== 'pending' ? entry.status : null;
}

export const skillDeletionRequests = {
  async add(userId: string, proposal: SkillDeletionProposal): Promise<string> {
    const requestId = randomUUID();
    await store.add(userId, requestId, proposal);
    return requestId;
  },
  async list(userId: string): Promise<SkillDeletionRequestView[]> {
    const entries = await store.list(userId);
    return entries.map((entry) => ({
      ...entry.payload,
      requestId: entry.id,
      requestedAt: entry.requestedAt,
    }));
  },
  /** Returns false when the request does not exist for this user (expired or foreign). */
  async decide(userId: string, requestId: string, decision: SkillDeletionDecision): Promise<boolean> {
    const entry = await store.get(userId, requestId);
    if (!entry || entry.status !== 'pending') {
      return false;
    }
    await store.decide(userId, requestId, decision);
    return true;
  },
  waitForDecision(
    userId: string,
    requestId: string,
    timeoutMs: number = SKILL_DELETION_TIMEOUT_MS,
  ): Promise<SkillDeletionDecision | null> {
    return waitForNotifiedValue(notifier, userId, () => readDecision(userId, requestId), timeoutMs);
  },
  remove(userId: string, requestId: string): Promise<void> {
    return store.remove(userId, requestId);
  },
};
