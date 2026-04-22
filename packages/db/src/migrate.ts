import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { closeDb, getDb } from './client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath: string, opts?: { override?: boolean }) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key) continue;

    if (!opts?.override && process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, '../../../.env'));
loadEnvFile(path.resolve(__dirname, '../../../.env.local'), { override: true });

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  opts: { attempts: number; baseDelayMs: number },
): Promise<{ value: T; attemptsUsed: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return { value: await operation(), attemptsUsed: attempt };
    } catch (error) {
      lastError = error;
      await closeDb().catch(() => undefined);
      if (attempt < opts.attempts) {
        // eslint-disable-next-line no-console
        console.warn(`[db] migration attempt ${attempt} failed; retrying...`, error);
        await wait(opts.baseDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

const migrateOnce = async () => {
  const db = getDb();

  // These extensions must exist before Drizzle creates tables that use `citext`
  // or `vector` column types. Running them here is idempotent.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  await migrate(db, { migrationsFolder: './drizzle/out' });
  await closeDb();
};

const run = async () => {
  const result = await withRetry(migrateOnce, { attempts: 3, baseDelayMs: 1000 });
  // eslint-disable-next-line no-console
  console.info(
    result.attemptsUsed > 1
      ? `[db] migrations applied after ${result.attemptsUsed} attempts`
      : '[db] migrations applied',
  );
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[db] migration failed', err);
  process.exit(1);
});
