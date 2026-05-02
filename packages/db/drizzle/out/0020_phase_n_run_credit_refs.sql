-- Phase N — generation_run gains credit-ledger references.
-- creditEventIds: jsonb array of credit_event.id values tied to this run.
-- estimatedHours / actualHours: estimate captured at start, true-up at end.

ALTER TABLE "generation_run"
  ADD COLUMN IF NOT EXISTS "credit_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "generation_run"
  ADD COLUMN IF NOT EXISTS "estimated_hours" integer;
--> statement-breakpoint
ALTER TABLE "generation_run"
  ADD COLUMN IF NOT EXISTS "actual_hours" integer;
