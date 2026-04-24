// Node-runtime NextAuth instance: edge config + DrizzleAdapter.
// Consumed by `apps/web/src/app/api/auth/[...nextauth]/route.ts` and by
// server components / actions that call `auth()` to read the session.
//
// The NextAuth instance is created lazily on first call so that importing
// this module during `next build` (where DATABASE_URL may not be set) does
// not throw. The DB pool is established on the first actual auth request.

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { and, eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import type { NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getDb } from '@creatorcanon/db';
import {
  account,
  allowlistEmail,
  isAllowlistApproved,
  session,
  user,
  verificationToken,
  workspace,
  workspaceMember,
} from '@creatorcanon/db/schema';

import { authConfig } from './config';

import './types';

export { authConfig } from './config';

let _instance: NextAuthResult | undefined;

function getInstance(): NextAuthResult {
  if (_instance) return _instance;

  const devBypassEnabled = process.env.DEV_AUTH_BYPASS_ENABLED === 'true';

  _instance = NextAuth({
    ...authConfig,
    providers: [
      ...authConfig.providers,
      ...(devBypassEnabled
        ? [
            Credentials({
              id: 'credentials',
              name: 'Local Dev',
              credentials: {
                email: { label: 'Email', type: 'email' },
              },
              async authorize(credentials) {
                const email = typeof credentials?.email === 'string'
                  ? credentials.email.trim().toLowerCase()
                  : '';

                if (!email) return null;

                const db = getDb();
                const rows = await db
                  .select({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    isAdmin: user.isAdmin,
                  })
                  .from(user)
                  .where(eq(user.email, email))
                  .limit(1);

                const existingUser = rows[0];
                if (!existingUser) return null;

                return {
                  id: existingUser.id,
                  email: existingUser.email,
                  name: existingUser.name,
                  image: existingUser.image,
                  isAdmin: existingUser.isAdmin,
                };
              },
            }),
          ]
        : []),
    ],
    adapter: DrizzleAdapter(getDb(), {
      usersTable: user,
      accountsTable: account,
      sessionsTable: session,
      verificationTokensTable: verificationToken,
    }),
    callbacks: {
      ...authConfig.callbacks,
      // Allowlist gate: email must be present with approved=true in
      // `allowlist_email`. Dev bypass short-circuits this for local work.
      // Returning false → NextAuth redirects to /sign-in?error=AccessDenied.
      async signIn({ user: signedInUser }) {
        const email = signedInUser?.email?.trim().toLowerCase();
        if (!email) return false;
        if (process.env.DEV_AUTH_BYPASS_ENABLED === 'true') return true;

        const db = getDb();
        const rows = await db
          .select({
            email: allowlistEmail.email,
            approved: allowlistEmail.approved,
            invitedByUserId: allowlistEmail.invitedByUserId,
            requestedByIp: allowlistEmail.requestedByIp,
            note: allowlistEmail.note,
            createdAt: allowlistEmail.createdAt,
            approvedAt: allowlistEmail.approvedAt,
          })
          .from(allowlistEmail)
          .where(eq(allowlistEmail.email, email))
          .limit(1);

        if (!isAllowlistApproved(rows[0])) {
          console.warn('[auth] sign-in rejected — not on allowlist:', email);
          return false;
        }
        return true;
      },
      // DB-aware jwt override: hydrates isAdmin from the DB on first sign-in.
      async jwt({ token, user: signedInUser, trigger, account: oauthAccount }) {
        if (signedInUser?.id) {
          const db = getDb();
          const rows = await db
            .select({ id: user.id, isAdmin: user.isAdmin })
            .from(user)
            .where(eq(user.id, signedInUser.id))
            .limit(1);
          token.userId = signedInUser.id;
          token.isAdmin = rows[0]?.isAdmin ?? false;

          // JWT strategy doesn't auto-update stored tokens on re-sign-in.
          // Manually persist fresh tokens so server actions can use them.
          if (oauthAccount?.access_token) {
            try {
              await db
                .update(account)
                .set({
                  access_token: oauthAccount.access_token,
                  refresh_token: (oauthAccount.refresh_token as string | undefined) ?? null,
                  expires_at: (oauthAccount.expires_at as number | undefined) ?? null,
                  scope: (oauthAccount.scope as string | undefined) ?? null,
                  id_token: (oauthAccount.id_token as string | undefined) ?? null,
                })
                .where(
                  and(
                    eq(account.provider, oauthAccount.provider),
                    eq(account.providerAccountId, oauthAccount.providerAccountId),
                  ),
                );
            } catch (e) {
              console.error('[auth] failed to refresh account tokens:', e);
            }
          }
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

        // Provision a workspace if the user doesn't have one yet.
        const existing = await db
          .select({ workspaceId: workspaceMember.workspaceId })
          .from(workspaceMember)
          .where(eq(workspaceMember.userId, signedInUser.id))
          .limit(1);

        if (existing.length === 0) {
          const workspaceId = crypto.randomUUID();
          const rawName = signedInUser.name ?? signedInUser.email ?? 'workspace';
          const namePart = rawName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 30);
          const slug = `${namePart}-${workspaceId.slice(0, 8)}`;

          await db.insert(workspace).values({
            id: workspaceId,
            ownerUserId: signedInUser.id,
            name: rawName,
            slug,
          });

          await db.insert(workspaceMember).values({
            workspaceId,
            userId: signedInUser.id,
            role: 'owner',
            joinedAt: new Date(),
          });
        }
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
