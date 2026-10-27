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

const SESSION_CHANNEL = 'roko:session-requests';
/** Backend safety re-check in case a pub/sub message is ever dropped. */
const FALLBACK_POLL_MS = 5000;

export function createRequestNotifier(
  redis: Redis | Cluster | null,
  channel: string = SESSION_CHANNEL,
): RequestNotifier {
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
  sub.subscribe(channel).catch((err) => logger.error('[roko] notifier subscribe failed', err));
  sub.on('message', (_channel: string, sessionId: string) => local.emit(sessionId));

  const publish = (sessionId: string): void => {
    redis
      .publish(channel, sessionId)
      .catch((err) => logger.error('[roko] notifier publish failed', err));
  };

  return { publish, subscribe };
}

/**
 * Resolves with the first non-null `read()` result, re-reading whenever `key` is
 * notified (plus a slow fallback poll), or with null once `timeoutMs` elapses.
 */
export async function waitForNotifiedValue<R>(
  notifier: RequestNotifier,
  key: string,
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
    const unsubscribe = notifier.subscribe(key, check);
    const poll = setInterval(check, FALLBACK_POLL_MS);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}
