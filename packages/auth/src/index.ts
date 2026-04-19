// Node-runtime NextAuth instance: edge config + DrizzleAdapter.
// Consumed by `apps/web/src/app/api/auth/[...nextauth]/route.ts` and by
// server components / actions that call `auth()` to read the session.

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';

import { getDb } from '@atlas/db';
import { account, session, user, verificationToken } from '@atlas/db/schema';

import { authConfig } from './config';

import './types';

export { authConfig } from './config';

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: user,
    accountsTable: account,
    sessionsTable: session,
    verificationTokensTable: verificationToken,
  }),
  callbacks: {
    ...authConfig.callbacks,
    // Override the edge-safe `jwt` callback with a DB-aware hydrator.
    // On first sign-in (`user` present) we fetch `is_admin` from the DB so
    // downstream admin gates don't need a second round-trip per request.
    async jwt({ token, user: signedInUser, trigger }) {
      if (signedInUser?.id) {
        const db = getDb();
        const rows = await db
          .select({ id: user.id, isAdmin: user.isAdmin })
          .from(user)
          .where(eq(user.id, signedInUser.id))
          .limit(1);
        const row = rows[0];
        token.userId = signedInUser.id;
        token.isAdmin = row?.isAdmin ?? false;
      }
      if (trigger === 'update' && token.userId) {
        const db = getDb();
        const rows = await db
          .select({ isAdmin: user.isAdmin })
          .from(user)
          .where(eq(user.id, token.userId))
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
