-- Approve 2 beta creators for the cohort-1 alpha.
-- Run against the hosted Neon database (use .env DATABASE_URL).
--
-- Operator: replace the two email literals below with the actual creator
-- emails before running. The ON CONFLICT clause makes this safe to re-run.
--
-- After applying: the allowlist signIn callback in packages/auth/src/index.ts
-- will let these emails sign in (Google OAuth). Any other email will be
-- rejected with /sign-in?error=AccessDenied and prompted to /request-access.
--
-- Confirm state afterwards:
--   SELECT email, approved, approved_at, note FROM allowlist_email ORDER BY created_at DESC;

INSERT INTO allowlist_email (email, approved, approved_at, note)
VALUES
  -- TODO(operator): replace with real creator emails before running
  ('TODO-creator-1@example.com', true, NOW(), 'cohort-1 alpha'),
  ('TODO-creator-2@example.com', true, NOW(), 'cohort-1 alpha')
ON CONFLICT (email)
DO UPDATE SET
  approved    = true,
  approved_at = NOW(),
  note        = EXCLUDED.note;

-- Operator reference — already-approved accounts at the time of cohort-1 setup:
-- - mariosdemosthenous11@gmail.com (operator, seeded during plan Task 2)
