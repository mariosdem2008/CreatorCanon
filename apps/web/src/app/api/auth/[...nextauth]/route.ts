// NextAuth route handlers. Runs on the Node runtime so the DrizzleAdapter
// (postgres.js) works during the sign-in → DB write path.

import { handlers } from '@atlas/auth';

export const { GET, POST } = handlers;

export const runtime = 'nodejs';
