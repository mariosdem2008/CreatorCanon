import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { closeDb, getDb } from './client';

const run = async () => {
  const db = getDb();

  // These extensions must exist before Drizzle creates tables that use `citext`
  // or `vector` column types. Running them here is idempotent.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  await migrate(db, { migrationsFolder: './drizzle/out' });
  await closeDb();
  // eslint-disable-next-line no-console
  console.info('[db] migrations applied');
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[db] migration failed', err);
  process.exit(1);
});
