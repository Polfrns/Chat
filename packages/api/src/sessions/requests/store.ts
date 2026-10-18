import { logger } from '@librechat/data-schemas';
import type { Redis, Cluster } from 'ioredis';
import type { RequestNotifier } from './notifier';

/**
 * Ephemeral, session-keyed store of pending approval requests. Backed by Redis
 * hashes (one key per session+kind, with a TTL just above the hook's approval
 * timeout) when Redis is configured, else an in-process Map — same async surface
 * either way. Every mutation pings the notifier so subscribers re-read.
 *
 * Entry status: 'pending' | <decision>. `list` returns pending only (what the UI
 * shows); a blocked hook reads the resolved decision via `get` and clears it with
 * `remove`. On confirm, `values` carries the user's (possibly edited) final input.
 */
export interface RequestEntry<P, D extends string, V> {
  id: string;
  payload: P;
  status: 'pending' | D;
  requestedAt: number;
  values?: V;
}

export interface RequestStore<P, D extends string, V> {
  add: (sessionId: string, id: string, payload: P) => Promise<void>;
  list: (sessionId: string) => Promise<Array<RequestEntry<P, D, V>>>;
  get: (sessionId: string, id: string) => Promise<RequestEntry<P, D, V> | null>;
  decide: (sessionId: string, id: string, status: D, values?: V) => Promise<void>;
  remove: (sessionId: string, id: string) => Promise<void>;
}

interface StoreConfig {
  /** Distinguishes the two request kinds in the Redis keyspace. */
  kind: string;
  redis: Redis | Cluster | null;
  notifier: RequestNotifier;
  ttlSeconds: number;
}

export function createRequestStore<P, D extends string, V>(
  config: StoreConfig,
): RequestStore<P, D, V> {
  const { kind, redis, notifier, ttlSeconds } = config;
  const backend = redis ? redisBackend<P, D, V>(redis, kind, ttlSeconds) : memoryBackend<P, D, V>();

  return {
    async add(sessionId, id, payload) {
      await backend.set(sessionId, {
        id,
        payload,
        status: 'pending',
        requestedAt: Date.now(),
      });
      notifier.publish(sessionId);
    },
    async list(sessionId) {
      const entries = await backend.getAll(sessionId);
      return entries.filter((entry) => entry.status === 'pending');
    },
    get(sessionId, id) {
      return backend.get(sessionId, id);
    },
    async decide(sessionId, id, status, values) {
      const entry = await backend.get(sessionId, id);
      if (entry) {
        await backend.set(sessionId, { ...entry, status, values });
        notifier.publish(sessionId);
      }
    },
    async remove(sessionId, id) {
      await backend.del(sessionId, id);
      notifier.publish(sessionId);
    },
  };
}

interface Backend<P, D extends string, V> {
  set: (sessionId: string, entry: RequestEntry<P, D, V>) => Promise<void>;
  get: (sessionId: string, id: string) => Promise<RequestEntry<P, D, V> | null>;
  getAll: (sessionId: string) => Promise<Array<RequestEntry<P, D, V>>>;
  del: (sessionId: string, id: string) => Promise<void>;
}

function memoryBackend<P, D extends string, V>(): Backend<P, D, V> {
  const bySession = new Map<string, Map<string, RequestEntry<P, D, V>>>();
  return {
    async set(sessionId, entry) {
      const existing = bySession.get(sessionId) ?? new Map();
      existing.set(entry.id, entry);
      bySession.set(sessionId, existing);
    },
    async get(sessionId, id) {
      return bySession.get(sessionId)?.get(id) ?? null;
    },
    async getAll(sessionId) {
      return Array.from(bySession.get(sessionId)?.values() ?? []);
    },
    async del(sessionId, id) {
      const existing = bySession.get(sessionId);
      if (!existing) {
        return;
      }
      existing.delete(id);
      if (existing.size === 0) {
        bySession.delete(sessionId);
      }
    },
  };
}

function redisBackend<P, D extends string, V>(
  redis: Redis | Cluster,
  kind: string,
  ttlSeconds: number,
): Backend<P, D, V> {
  const key = (sessionId: string): string => `roko:req:${kind}:${sessionId}`;
  const parse = (raw: string | null): RequestEntry<P, D, V> | null => {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as RequestEntry<P, D, V>;
    } catch (err) {
      logger.error('[roko] failed to parse stored request', err);
      return null;
    }
  };

  return {
    async set(sessionId, entry) {
      const hashKey = key(sessionId);
      await redis.hset(hashKey, entry.id, JSON.stringify(entry));
      await redis.expire(hashKey, ttlSeconds);
    },
    async get(sessionId, id) {
      return parse(await redis.hget(key(sessionId), id));
    },
    async getAll(sessionId) {
      const all = await redis.hgetall(key(sessionId));
      return Object.values(all)
        .map(parse)
        .filter((entry): entry is RequestEntry<P, D, V> => entry !== null);
    },
    async del(sessionId, id) {
      await redis.hdel(key(sessionId), id);
    },
  };
}
