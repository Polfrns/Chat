import { randomUUID } from 'crypto';
import { ioredisClient } from '../../cache/redisClients';
import { createRequestNotifier } from './notifier';
import { createRequestStore } from './store';

/**
 * Wiring for the two ephemeral approval flows (filestore access + creation),
 * sharing one notifier so a single SSE stream per session covers both. The
 * public surface mirrors the old in-memory services (now async) and adds
 * `waitForDecision`, which the agent hooks await instead of busy-polling.
 */

export interface FilestoreAccessRequestPayload {
  filestoreUid: string;
  displayName: string;
  description?: string;
  shared: boolean;
  reason?: string;
}
export type FilestoreAccessDecision = 'approve' | 'deny';
export type FilestoreAccessRequestView = FilestoreAccessRequestPayload & { requestedAt: number };

export interface FilestoreCreationProposal {
  displayName: string;
  description: string;
  shared: boolean;
  readOnly: boolean;
}
export type FilestoreCreationDecision = 'confirm' | 'decline';
export interface FilestoreCreationDecisionResult {
  status: FilestoreCreationDecision;
  values?: FilestoreCreationProposal;
}
export interface FilestoreCreationRequestView {
  requestId: string;
  proposed: FilestoreCreationProposal;
  requestedAt: number;
}

/** Slightly above the hooks' approval timeout so entries outlive a pending wait. */
const TTL_SECONDS = 180;
/** Backend safety re-check in case a pub/sub message is ever dropped. */
const FALLBACK_POLL_MS = 5000;

export interface FilestoreAccessRequestService {
  addRequest: (sessionId: string, payload: FilestoreAccessRequestPayload) => Promise<void>;
  listRequests: (sessionId: string) => Promise<FilestoreAccessRequestView[]>;
  decideRequest: (
    sessionId: string,
    filestoreUid: string,
    decision: FilestoreAccessDecision,
  ) => Promise<void>;
  getDecision: (sessionId: string, filestoreUid: string) => Promise<FilestoreAccessDecision | null>;
  removeRequest: (sessionId: string, filestoreUid: string) => Promise<void>;
  waitForDecision: (
    sessionId: string,
    filestoreUid: string,
    timeoutMs: number,
  ) => Promise<FilestoreAccessDecision | null>;
}

export interface FilestoreCreationRequestService {
  addRequest: (sessionId: string, proposed: FilestoreCreationProposal) => Promise<string>;
  listRequests: (sessionId: string) => Promise<FilestoreCreationRequestView[]>;
  decideRequest: (
    sessionId: string,
    requestId: string,
    decision: FilestoreCreationDecision,
    values?: FilestoreCreationProposal,
  ) => Promise<void>;
  getDecision: (
    sessionId: string,
    requestId: string,
  ) => Promise<FilestoreCreationDecisionResult | null>;
  removeRequest: (sessionId: string, requestId: string) => Promise<void>;
  waitForDecision: (
    sessionId: string,
    requestId: string,
    timeoutMs: number,
  ) => Promise<FilestoreCreationDecisionResult | null>;
}

const notifier = createRequestNotifier(ioredisClient);

export const subscribeFilestoreRequests: (sessionId: string, handler: () => void) => () => void =
  notifier.subscribe;

const accessStore = createRequestStore<
  FilestoreAccessRequestPayload,
  FilestoreAccessDecision,
  never
>({
  kind: 'access',
  redis: ioredisClient,
  notifier,
  ttlSeconds: TTL_SECONDS,
});

const creationStore = createRequestStore<
  FilestoreCreationProposal,
  FilestoreCreationDecision,
  FilestoreCreationProposal
>({
  kind: 'creation',
  redis: ioredisClient,
  notifier,
  ttlSeconds: TTL_SECONDS,
});

async function waitForDecision<R>(
  sessionId: string,
  read: () => Promise<R | null>,
  timeoutMs: number,
): Promise<R | null> {
  const immediate = await read();
  if (immediate) {
    return immediate;
  }
  return new Promise<R | null>((resolve) => {
    let settled = false;
    const finish = (value: R | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      clearInterval(poll);
      clearTimeout(timer);
      resolve(value);
    };
    const check = (): void => {
      read()
        .then((value) => value && finish(value))
        .catch(() => undefined);
    };
    const unsubscribe = notifier.subscribe(sessionId, check);
    const poll = setInterval(check, FALLBACK_POLL_MS);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

export const filestoreAccessRequests: FilestoreAccessRequestService = {
  async addRequest(sessionId: string, payload: FilestoreAccessRequestPayload): Promise<void> {
    if (!sessionId || !payload?.filestoreUid) {
      return;
    }
    await accessStore.add(sessionId, payload.filestoreUid, payload);
  },
  async listRequests(sessionId: string): Promise<FilestoreAccessRequestView[]> {
    const entries = await accessStore.list(sessionId);
    return entries.map((entry) => ({ ...entry.payload, requestedAt: entry.requestedAt }));
  },
  async decideRequest(
    sessionId: string,
    filestoreUid: string,
    decision: FilestoreAccessDecision,
  ): Promise<void> {
    await accessStore.decide(sessionId, filestoreUid, decision);
  },
  getDecision: readFilestoreAccessDecision,
  async removeRequest(sessionId: string, filestoreUid: string): Promise<void> {
    await accessStore.remove(sessionId, filestoreUid);
  },
  waitForDecision(
    sessionId: string,
    filestoreUid: string,
    timeoutMs: number,
  ): Promise<FilestoreAccessDecision | null> {
    return waitForDecision(
      sessionId,
      () => readFilestoreAccessDecision(sessionId, filestoreUid),
      timeoutMs,
    );
  },
};

async function readFilestoreAccessDecision(
  sessionId: string,
  filestoreUid: string,
): Promise<FilestoreAccessDecision | null> {
  const entry = await accessStore.get(sessionId, filestoreUid);
  return entry && entry.status !== 'pending' ? entry.status : null;
}

export const filestoreCreationRequests: FilestoreCreationRequestService = {
  async addRequest(sessionId: string, proposed: FilestoreCreationProposal): Promise<string> {
    const requestId = randomUUID();
    await creationStore.add(sessionId, requestId, proposed);
    return requestId;
  },
  async listRequests(sessionId: string): Promise<FilestoreCreationRequestView[]> {
    const entries = await creationStore.list(sessionId);
    return entries.map((entry) => ({
      requestId: entry.id,
      proposed: entry.payload,
      requestedAt: entry.requestedAt,
    }));
  },
  async decideRequest(
    sessionId: string,
    requestId: string,
    decision: FilestoreCreationDecision,
    values?: FilestoreCreationProposal,
  ): Promise<void> {
    await creationStore.decide(sessionId, requestId, decision, values);
  },
  getDecision: readFilestoreCreationDecision,
  async removeRequest(sessionId: string, requestId: string): Promise<void> {
    await creationStore.remove(sessionId, requestId);
  },
  waitForDecision(
    sessionId: string,
    requestId: string,
    timeoutMs: number,
  ): Promise<FilestoreCreationDecisionResult | null> {
    return waitForDecision(
      sessionId,
      () => readFilestoreCreationDecision(sessionId, requestId),
      timeoutMs,
    );
  },
};

async function readFilestoreCreationDecision(
  sessionId: string,
  requestId: string,
): Promise<FilestoreCreationDecisionResult | null> {
  const entry = await creationStore.get(sessionId, requestId);
  if (!entry || entry.status === 'pending') {
    return null;
  }
  return { status: entry.status, values: entry.values };
}
