import { customType } from 'drizzle-orm/pg-core';

/**
 * pgvector column helper. Drizzle-kit cannot emit an HNSW index directly;
 * post-migration SQL adds `CREATE INDEX ... USING hnsw (... vector_cosine_ops)`.
 *
 * Usage: `embedding: vector('embedding', { dimensions: 1536 })`
 */
export const vector = (name: string, opts: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${opts.dimensions})`,
    fromDriver: (v) => JSON.parse(v as string),
    toDriver: (v) => JSON.stringify(v),
  })(name);

/**
 * Postgres `tsvector` for FTS. Generated columns are written via raw SQL in
 * migrations — this helper just exposes the column type for reads.
 */
export const tsvector = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `tsvector`,
  })(name);

/**
 * citext helper (Postgres case-insensitive text). Requires `CREATE EXTENSION citext`.
 */
export const citext = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `citext`,
  })(name);

/**
 * bytea helper for encrypted tokens (libsodium blobs).
 */
export const bytea = (name: string) =>
  customType<{ data: Buffer; driverData: Buffer }>({
    dataType: () => `bytea`,
  })(name);
