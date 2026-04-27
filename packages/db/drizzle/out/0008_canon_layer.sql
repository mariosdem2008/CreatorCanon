CREATE TABLE IF NOT EXISTS "channel_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_intelligence_card" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"video_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence_segment_ids" text[] DEFAULT '{}' NOT NULL,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canon_node" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence_segment_ids" text[] DEFAULT '{}' NOT NULL,
	"source_video_ids" text[] DEFAULT '{}' NOT NULL,
	"evidence_quality" text NOT NULL,
	"origin" text DEFAULT 'single_video' NOT NULL,
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"source_coverage" integer DEFAULT 0 NOT NULL,
	"page_worthiness_score" integer DEFAULT 0 NOT NULL,
	"specificity_score" integer DEFAULT 0 NOT NULL,
	"creator_uniqueness_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_brief" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"page_worthiness_score" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_quality_report" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"page_id" text NOT NULL,
	"evidence_score" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"distinct_source_videos" integer DEFAULT 0 NOT NULL,
	"empty_section_count" integer DEFAULT 0 NOT NULL,
	"unsupported_claim_count" integer DEFAULT 0 NOT NULL,
	"generic_language_score" integer DEFAULT 0 NOT NULL,
	"recommendation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visual_moment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"video_id" text NOT NULL,
	"segment_id" text,
	"timestamp_ms" integer NOT NULL,
	"frame_r2_key" text,
	"thumbnail_r2_key" text,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"extracted_text" text,
	"hub_use" text NOT NULL,
	"usefulness_score" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_profile" ADD CONSTRAINT "channel_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_profile" ADD CONSTRAINT "channel_profile_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "video_intelligence_card_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "video_intelligence_card_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "video_intelligence_card_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canon_node" ADD CONSTRAINT "canon_node_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canon_node" ADD CONSTRAINT "canon_node_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_brief" ADD CONSTRAINT "page_brief_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_brief" ADD CONSTRAINT "page_brief_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_quality_report" ADD CONSTRAINT "page_quality_report_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_quality_report" ADD CONSTRAINT "page_quality_report_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_profile_run_unique" ON "channel_profile" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vic_run_video_unique" ON "video_intelligence_card" USING btree ("run_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vic_run_idx" ON "video_intelligence_card" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canon_node_run_type_idx" ON "canon_node" USING btree ("run_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_brief_run_position_idx" ON "page_brief" USING btree ("run_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pqr_run_page_unique" ON "page_quality_report" USING btree ("run_id","page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_moment_run_video_idx" ON "visual_moment" USING btree ("run_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_moment_run_score_idx" ON "visual_moment" USING btree ("run_id","usefulness_score");
