// Drizzle schema barrel. Order-independent — each domain file imports what it
// needs directly. Consumers should import from `@creatorcanon/db/schema`.

export * from './_vector';
export * from './enums';

// Identity + tenancy
export * from './auth';
export * from './allowlist';
export * from './workspace';

// Source media
export * from './youtube';

// Selection + runs
export * from './project';
export * from './run';

// Transcript + visual lanes
export * from './transcript';
export * from './visual';

// Knowledge model
export * from './atom';
export * from './cluster';

// Content
export * from './page';

// Chat
export * from './chat';

// Publish / release
export * from './release';

// Multi-agent pipeline findings
export * from './archive_finding';

// Canon layer (deep knowledge extraction — Stage 1 v4)
export * from './canon';

// Billing + cost
export * from './billing';

// Observability / audit
export * from './audit';
export * from './archive_audit';

// Atlas agent + inbox
export * from './agent';
export * from './inbox';
