/**
 * Shared ioredis connection for the app + BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck:
 * false` on any connection it uses for blocking commands (workers and
 * queue events). We keep a single connection factory for consistency.
 */

import IORedis, { type Redis, type RedisOptions } from "ioredis";
import { config } from "../config.js";

let cached: Redis | undefined;

const defaultOpts: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
};

export function getRedis(): Redis {
  if (!cached) {
    cached = new IORedis(config.REDIS_URL, defaultOpts);
  }
  return cached;
}

/** Fresh connection for BullMQ (workers can't share with publishers safely). */
export function createRedis(): Redis {
  return new IORedis(config.REDIS_URL, defaultOpts);
}

export async function closeRedis() {
  if (cached) {
    await cached.quit();
    cached = undefined;
  }
}
