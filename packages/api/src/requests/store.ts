import type { Redis, Cluster } from 'ioredis';
import type { RequestNotifier } from './notifier';

type RequestStatus<Decision> = 'pending' | Decision;

interface RequestEntry<Payload, Decision> {
  id: string;
  requestedAt: number;
  payload: Payload;
  status: RequestStatus<Decision>;
}

interface RequestStoreOptions<Decision> {
  kind: string;
  redis: Redis | Cluster | null;
  notifier: RequestNotifier;
  ttlSeconds: number;
}

const localRequests = new Map<string, RequestEntry<unknown, unknown>>();
const requestKey = (kind: string, userId: string, id: string) =>
  `roko:request:${kind}:{${userId}}:${id}`;
const userIndexKey = (kind: string, userId: string) => `roko:request:${kind}:{${userId}}:ids`;

export function createRequestStore<Payload, Decision, _Unused>(options: RequestStoreOptions<Decision>) {
  const { kind, redis, notifier, ttlSeconds } = options;

  async function get(userId: string, id: string): Promise<RequestEntry<Payload, Decision> | null> {
    const key = requestKey(kind, userId, id);
    const value = redis ? await redis.get(key) : localRequests.get(key);
    if (!value) {
      return null;
    }
    return (typeof value === 'string' ? JSON.parse(value) : value) as RequestEntry<Payload, Decision>;
  }

  async function save(userId: string, entry: RequestEntry<Payload, Decision>): Promise<void> {
    const key = requestKey(kind, userId, entry.id);
    if (redis) {
      await redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
      await redis.sadd(userIndexKey(kind, userId), entry.id);
      await redis.expire(userIndexKey(kind, userId), ttlSeconds);
    } else {
      localRequests.set(key, entry as RequestEntry<unknown, unknown>);
    }
  }

  return {
    async add(userId: string, id: string, payload: Payload): Promise<void> {
      await save(userId, { id, payload, requestedAt: Date.now(), status: 'pending' });
    },
    get,
    async list(userId: string): Promise<RequestEntry<Payload, Decision>[]> {
      const ids = redis
        ? await redis.smembers(userIndexKey(kind, userId))
        : Array.from(localRequests.keys())
            .filter((key) => key.startsWith(`roko:request:${kind}:{${userId}}:`))
            .map((key) => key.slice(key.lastIndexOf(':') + 1));
      const entries = await Promise.all(ids.map((id) => get(userId, id)));
      return entries.filter(
        (entry): entry is RequestEntry<Payload, Decision> => entry !== null && entry.status === 'pending',
      );
    },
    async decide(userId: string, id: string, decision: Decision): Promise<void> {
      const entry = await get(userId, id);
      if (!entry || entry.status !== 'pending') {
        return;
      }
      await save(userId, { ...entry, status: decision });
      await notifier.notify(userId);
    },
    async remove(userId: string, id: string): Promise<void> {
      const key = requestKey(kind, userId, id);
      if (redis) {
        await redis.del(key);
        await redis.srem(userIndexKey(kind, userId), id);
      } else {
        localRequests.delete(key);
      }
    },
  };
}
