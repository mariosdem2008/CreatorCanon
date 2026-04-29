-- Add 'audit_ready' to run_status enum so the pipeline can park between
-- the audit phase (channel_profile..page_briefs) and the hub-build phase
-- (page_composition..adapt) for user review.
-- Order BEFORE awaiting_review so the natural state machine reads:
--   running -> audit_ready -> running -> awaiting_review
ALTER TYPE "run_status" ADD VALUE IF NOT EXISTS 'audit_ready' BEFORE 'awaiting_review';
