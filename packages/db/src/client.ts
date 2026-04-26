import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type AtlasDb = PostgresJsDatabase<typeof schema>;

// Stash on globalThis in dev so Next.js HMR doesn't leak connections by
// creating a new postgres pool on every module reload.
type GlobalWithDb = typeof globalThis & {
  __atlasDb?: AtlasDb;
  __atlasClient?: ReturnType<typeof postgres>;
};

const g = globalThis as GlobalWithDb;

export const getDb = (databaseUrl?: string): AtlasDb => {
  if (g.__atlasDb) return g.__atlasDb;

  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Cannot create database client.');
  }

  const poolMax = Number(process.env.DATABASE_POOL_MAX) || 10;
  const connectTimeout = Number(process.env.DATABASE_CONNECT_TIMEOUT) || 10;
  // Neon's pgbouncer-style pooler aggressively recycles idle connections.
  // Letting us hold them past the pooler's idle horizon surfaces as
  // ECONNRESET on the next read. Recycling on our side at a shorter
  // horizon avoids that. Tunable via env so prod can override.
  const idleTimeout = Number(process.env.DATABASE_IDLE_TIMEOUT) || 15;
  const maxLifetime = Number(process.env.DATABASE_MAX_LIFETIME) || 60 * 5;

  const client = postgres(url, {
    prepare: false,
    max: poolMax,
    idle_timeout: idleTimeout,
    max_lifetime: maxLifetime,
    connect_timeout: connectTimeout,
    connection: {
      application_name: process.env.DATABASE_APP_NAME ?? 'creatorcanon-web',
    },
  });

  const db = drizzle(client, { schema });

  // In production we skip the global stash so the module singleton is used
  // directly; no risk of HMR there. In dev the global survives reloads.
  if (process.env.NODE_ENV !== 'production') {
    g.__atlasClient = client;
    g.__atlasDb = db;
  }

  return db;
};

export const closeDb = async (): Promise<void> => {
  const client = g.__atlasClient;
  if (client) {
    await client.end({ timeout: 5 });
    g.__atlasClient = undefined;
    g.__atlasDb = undefined;
  }
};

const TRANSIENT_DB_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECTION_CLOSED',
  '57P01', // Postgres: admin_shutdown
  '57P02', // Postgres: crash_shutdown
  '57P03', // Postgres: cannot_connect_now
  '08000', // Postgres: connection_exception
  '08003', // Postgres: connection_does_not_exist
  '08006', // Postgres: connection_failure
  '08001', // Postgres: sqlclient_unable_to_establish_sqlconnection
  '08004', // Postgres: sqlserver_rejected_establishment_of_sqlconnection
]);

function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return typeof code === 'string' && TRANSIENT_DB_ERROR_CODES.has(code);
}

/**
 * Retry a DB-touching async operation through transient connection errors
 * (ECONNRESET, pooler resets, server bounces). Backs off exponentially with
 * a small jitter. Use this around server actions that absolutely must round-
 * trip the DB (request-access form, credentials-provider lookup) — not
 * around hot read paths where the latency added by retries is the wrong
 * trade-off.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 150);
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = baseDelayMs * 2 ** i + jitter;
      if (options.label) {
        console.warn(
          `[db-retry] ${options.label} attempt ${i + 1}/${attempts} failed (${
            (err as { code?: string }).code
          }); retrying in ${delay}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
