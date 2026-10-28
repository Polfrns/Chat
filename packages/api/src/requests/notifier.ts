import type { Redis, Cluster } from 'ioredis';

export interface RequestNotifier {
  notify: (userId: string) => Promise<void>;
  channel: string;
}

/** Notification is an optimization: waiters re-read their durable request state. */
export function createRequestNotifier(
  redis: Redis | Cluster | null,
  channel: string,
): RequestNotifier {
  return {
    channel,
    async notify(userId) {
      if (redis) {
        await redis.publish(channel, userId);
      }
    },
  };
}

export async function waitForNotifiedValue<T>(
  _notifier: RequestNotifier,
  _userId: string,
  read: () => Promise<T | null>,
  timeoutMs: number,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await read();
    if (value !== null) {
      return value;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
  } while (Date.now() <= deadline);
  return null;
}
