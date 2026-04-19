// Node-runtime NextAuth instance: edge config + DrizzleAdapter.
// Consumed by `apps/web/src/app/api/auth/[...nextauth]/route.ts` and by
// server components / actions that call `auth()` to read the session.
//
// The NextAuth instance is created lazily on first call so that importing
// this module during `next build` (where DATABASE_URL may not be set) does
// not throw. The DB pool is established on the first actual auth request.

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import type { NextAuthResult } from 'next-auth';

import { getDb } from '@atlas/db';
import { account, session, user, verificationToken } from '@atlas/db/schema';

import { authConfig } from './config';

import './types';

export { authConfig } from './config';

let _instance: NextAuthResult | undefined;

function getInstance(): NextAuthResult {
  if (_instance) return _instance;

  _instance = NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(getDb(), {
      usersTable: user,
      accountsTable: account,
      sessionsTable: session,
      verificationTokensTable: verificationToken,
    }),
    callbacks: {
      ...authConfig.callbacks,
      // DB-aware jwt override: hydrates isAdmin from the DB on first sign-in.
      async jwt({ token, user: signedInUser, trigger }) {
        if (signedInUser?.id) {
          const db = getDb();
          const rows = await db
            .select({ id: user.id, isAdmin: user.isAdmin })
            .from(user)
            .where(eq(user.id, signedInUser.id))
            .limit(1);
          token.userId = signedInUser.id;
          token.isAdmin = rows[0]?.isAdmin ?? false;
        }
        const existingId = token.userId as string | undefined;
        if (trigger === 'update' && existingId) {
          const db = getDb();
          const rows = await db
            .select({ isAdmin: user.isAdmin })
            .from(user)
            .where(eq(user.id, existingId))
            .limit(1);
          if (rows[0]) token.isAdmin = rows[0].isAdmin;
        }
        return token;
      },
    },
    events: {
      async signIn({ user: signedInUser }) {
        if (!signedInUser?.id) return;
        const db = getDb();
        await db
          .update(user)
          .set({ lastLoginAt: new Date() })
          .where(eq(user.id, signedInUser.id));
      },
    },
  });

  return _instance;
}

// Lazy forwarding proxies — each cast is safe because we forward to the
// real NextAuthResult member at call time, after getInstance() resolves.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const handlers: NextAuthResult['handlers'] = {
  GET: (req: any) => getInstance().handlers.GET(req),
  POST: (req: any) => getInstance().handlers.POST(req),
};

export const auth = ((...args: any[]) =>
  (getInstance().auth as any)(...args)) as NextAuthResult['auth'];

export const signIn = ((...args: any[]) =>
  (getInstance().signIn as any)(...args)) as NextAuthResult['signIn'];

export const signOut = ((...args: any[]) =>
  (getInstance().signOut as any)(...args)) as NextAuthResult['signOut'];
/* eslint-enable @typescript-eslint/no-explicit-any */
