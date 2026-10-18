import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { Redis, Cluster } from 'ioredis';

/**
 * Fan-out of "a session's pending requests changed" signals. Both the SSE stream
 * (push to the browser) and the blocked agent hooks (wake on the user's decision)
 * subscribe per session; the request store publishes on every mutation.
 *
 * With Redis, mutations on any instance reach every instance over one pub/sub
 * channel (the message body is the sessionId), so a request raised on instance A
 * still wakes an SSE stream or a decide-call served by instance B. Without Redis,
 * an in-process `EventEmitter` covers the single-instance case identically.
 */
export interface RequestNotifier {
  publish: (sessionId: string) => void;
  subscribe: (sessionId: string, handler: () => void) => () => void;
}

const CHANNEL = 'roko:session-requests';

export function createRequestNotifier(redis: Redis | Cluster | null): RequestNotifier {
  const local = new EventEmitter();
  /** One listener per active SSE stream / blocked hook — no fixed ceiling. */
  local.setMaxListeners(0);

  const subscribe = (sessionId: string, handler: () => void): (() => void) => {
    local.on(sessionId, handler);
    return () => local.off(sessionId, handler);
  };

  if (!redis) {
    return { publish: (sessionId) => local.emit(sessionId), subscribe };
  }

  /** Pub/sub needs a dedicated connection: a subscribed client can't issue normal
   *  commands. Redis delivers each publish to every subscriber including our own,
   *  so the publishing instance reacts via this same path (no extra local emit). */
  const sub = redis.duplicate();
  sub.subscribe(CHANNEL).catch((err) => logger.error('[roko] notifier subscribe failed', err));
  sub.on('message', (_channel: string, sessionId: string) => local.emit(sessionId));

  const publish = (sessionId: string): void => {
    redis
      .publish(CHANNEL, sessionId)
      .catch((err) => logger.error('[roko] notifier publish failed', err));
  };

  return { publish, subscribe };
}
