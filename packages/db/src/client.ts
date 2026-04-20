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

  const client = postgres(url, {
    prepare: false,
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: connectTimeout,
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
