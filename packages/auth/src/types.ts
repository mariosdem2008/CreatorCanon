// Module augmentation for Auth.js v5 — carry Atlas-specific fields on Session.
//
// JWT augmentation via 'next-auth/jwt' is not reliable in Auth.js v5 because
// the JWT interface lives in @auth/core/jwt (re-exported by next-auth/jwt) and
// has a `Record<string, unknown>` index signature that swallows custom fields.
// We type-cast JWT property access in config.ts instead.

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    isAdmin?: boolean;
  }
}

export {};
