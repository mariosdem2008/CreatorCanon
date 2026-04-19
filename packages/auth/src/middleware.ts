// Edge-runtime NextAuth slice for middleware. Uses the edge-safe config only
// (no DrizzleAdapter, no `postgres` driver) so it runs on Vercel's edge.

import NextAuth from 'next-auth';

import { authConfig } from './config';

export const { auth: edgeAuth } = NextAuth(authConfig);
