DO $$ BEGIN
 CREATE TYPE "public"."evidence_quality" AS ENUM('strong', 'moderate', 'limited', 'unverified');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."finding_type" AS ENUM('topic', 'framework', 'lesson', 'playbook', 'quote', 'aha_moment', 'source_ranking');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."hub_template_key" AS ENUM('editorial_atlas', 'legacy_v0');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."relation_type" AS ENUM('supports', 'builds_on', 'related_to', 'instance_of', 'contradicts');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archive_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"type" "finding_type" NOT NULL,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence_segment_ids" text[] DEFAULT '{}' NOT NULL,
	"evidence_quality" "evidence_quality" DEFAULT 'unverified' NOT NULL,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"duration_ms" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archive_relation" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"from_finding_id" text NOT NULL,
	"to_finding_id" text NOT NULL,
	"type" "relation_type" NOT NULL,
	"evidence_segment_ids" text[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hub" ADD COLUMN "template_key" "hub_template_key" DEFAULT 'legacy_v0' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "archive_finding" ADD CONSTRAINT "archive_finding_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "archive_relation" ADD CONSTRAINT "archive_relation_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "archive_relation" ADD CONSTRAINT "archive_relation_from_finding_id_archive_finding_id_fk" FOREIGN KEY ("from_finding_id") REFERENCES "public"."archive_finding"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "archive_relation" ADD CONSTRAINT "archive_relation_to_finding_id_archive_finding_id_fk" FOREIGN KEY ("to_finding_id") REFERENCES "public"."archive_finding"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_finding_run_type_idx" ON "archive_finding" USING btree ("run_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_finding_run_agent_idx" ON "archive_finding" USING btree ("run_id","agent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_relation_run_idx" ON "archive_relation" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_relation_from_idx" ON "archive_relation" USING btree ("from_finding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_relation_to_idx" ON "archive_relation" USING btree ("to_finding_id");