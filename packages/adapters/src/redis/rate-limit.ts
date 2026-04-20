import { CanonError } from '@creatorcanon/core';
import { z } from 'zod';

import type { RedisClient } from './client';

const rateLimiterOptionsSchema = z.object({
  /** Sliding window duration in milliseconds. */
  window: z.number().int().positive(),
  /** Max allowed requests per key within the window. */
  max: z.number().int().positive(),
  /** Namespace prefix for all keys this limiter writes. */
  prefix: z.string().min(1),
});

export type RateLimiterOptions = z.infer<typeof rateLimiterOptionsSchema>;

export interface RateLimitResult {
  ok: boolean;
  /** Requests still allowed in the current window. */
  remaining: number;
  /** When the current window fully resets (oldest sample ages out). */
  resetAt: Date;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

const notImplemented = (): CanonError =>
  new CanonError({
    code: 'not_implemented',
    category: 'internal',
    message: 'RateLimiter.check is not implemented yet (lands in Epic 5).',
  });

/**
 * Build a sliding-window rate limiter backed by a Redis sorted set.
 *
 * Algorithm (to be implemented in Epic 5):
 *   1. Drop entries older than `now - window` (`ZREMRANGEBYSCORE`).
 *   2. Count remaining entries (`ZCARD`).
 *   3. If count < max: push `now` (`ZADD`), set TTL = window, return `ok: true`.
 *   4. Else: read oldest entry (`ZRANGE 0 0 WITHSCORES`), compute `resetAt`,
 *      return `ok: false`.
 *
 * All four ops pipeline in one round-trip. The key shape is
 * `${prefix}:${key}` so multiple limiters can share one Redis.
 */
export const createRateLimiter = (
  redis: RedisClient,
  options: RateLimiterOptions,
): RateLimiter => {
  const opts = rateLimiterOptionsSchema.parse(options);

  return {
    async check(key) {
      z.string().min(1).parse(key);
      void redis;
      void opts;
      throw notImplemented();
    },
  };
};
