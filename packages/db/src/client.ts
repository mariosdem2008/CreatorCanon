import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type AtlasDb = PostgresJsDatabase<typeof schema>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: AtlasDb | null = null;

export const getDb = (databaseUrl?: string): AtlasDb => {
  if (_db) return _db;
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Cannot create database client.');
  }
  _client = postgres(url, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(_client, { schema });
  return _db;
};

export const closeDb = async (): Promise<void> => {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = null;
    _db = null;
  }
};
