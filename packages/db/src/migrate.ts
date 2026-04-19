import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { closeDb, getDb } from './client';

const run = async () => {
  const db = getDb();
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
