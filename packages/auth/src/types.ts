// Module augmentation for Auth.js — carry Atlas-specific fields (user id,
// isAdmin flag) on the Session and JWT so callers get typed access.

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

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    isAdmin?: boolean;
  }
}

export {};
