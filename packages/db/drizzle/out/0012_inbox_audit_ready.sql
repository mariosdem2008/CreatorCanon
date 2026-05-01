-- Add 'run_audit_ready' to the inbox_item_kind enum so the audit
-- checkpoint flow can fire its own inbox notification (separate from
-- 'run_awaiting_review' which fires after page_composition).
ALTER TYPE "inbox_item_kind" ADD VALUE IF NOT EXISTS 'run_audit_ready' BEFORE 'run_awaiting_review';
