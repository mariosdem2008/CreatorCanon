import { Redis } from '@upstash/redis';
import { AtlasError } from '@atlas/core';
import type { ServerEnv } from '@atlas/core';

export type RedisClient = Redis;

/**
 * Build an Upstash Redis REST client from a validated env.
 *
 * The env schema stores a single `REDIS_URL`; we expect it in the
 * `https://<user>:<token>@<region>.upstash.io` form that Upstash's REST
 * endpoint consumes. The `@upstash/redis` SDK auto-parses this when passed
 * via the `url` field.
 *
 * NOTE (contract ambiguity): the tech doc lists `REDIS_URL` but Upstash's
 * REST API normally wants `url + token` separately. We parse the URL to pull
 * the token out of userinfo; if the env ever switches to a TCP `redis://` URL
 * this factory must change. Keep this the single place that knows the shape.
 */
export const createRedisClient = (env: ServerEnv): RedisClient => {
  const raw = env.REDIS_URL;

  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new AtlasError({
      code: 'invalid_env',
      category: 'internal',
      message: 'REDIS_URL is not a valid URL.',
      cause,
    });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AtlasError({
      code: 'invalid_env',
      category: 'internal',
      message:
        'REDIS_URL must be an Upstash REST URL (https://...). TCP redis:// URLs are not supported by the @upstash/redis REST client.',
    });
  }

  const token = url.password || url.username;
  if (!token) {
    throw new AtlasError({
      code: 'invalid_env',
      category: 'internal',
      message:
        'REDIS_URL does not embed an Upstash token in its userinfo segment.',
    });
  }

  const restUrl = `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;

  return new Redis({ url: restUrl, token });
};
