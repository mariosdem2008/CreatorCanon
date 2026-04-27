CREATE TABLE IF NOT EXISTS "channel_profile" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "cost_cents" numeric(10,4) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_profile" ADD CONSTRAINT "channel_profile_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "channel_profile" ADD CONSTRAINT "channel_profile_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_profile_run_unique" ON "channel_profile" ("run_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "video_intelligence_card" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "video_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "evidence_segment_ids" text[] NOT NULL DEFAULT '{}',
  "cost_cents" numeric(10,4) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "vic_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "vic_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "vic_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vic_run_video_unique" ON "video_intelligence_card" ("run_id","video_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vic_run_idx" ON "video_intelligence_card" ("run_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "canon_node" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "evidence_segment_ids" text[] NOT NULL DEFAULT '{}',
  "source_video_ids" text[] NOT NULL DEFAULT '{}',
  "evidence_quality" text NOT NULL,
  "origin" text NOT NULL DEFAULT 'single_video',
  "confidence_score" integer NOT NULL DEFAULT 0,
  "citation_count" integer NOT NULL DEFAULT 0,
  "source_coverage" integer NOT NULL DEFAULT 0,
  "page_worthiness_score" integer NOT NULL DEFAULT 0,
  "specificity_score" integer NOT NULL DEFAULT 0,
  "creator_uniqueness_score" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canon_node" ADD CONSTRAINT "canon_node_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "canon_node" ADD CONSTRAINT "canon_node_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canon_node_run_type_idx" ON "canon_node" ("run_id","type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_brief" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "page_worthiness_score" integer NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_brief" ADD CONSTRAINT "page_brief_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "page_brief" ADD CONSTRAINT "page_brief_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_brief_run_position_idx" ON "page_brief" ("run_id","position");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_quality_report" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "page_id" text NOT NULL,
  "evidence_score" integer NOT NULL DEFAULT 0,
  "citation_count" integer NOT NULL DEFAULT 0,
  "distinct_source_videos" integer NOT NULL DEFAULT 0,
  "empty_section_count" integer NOT NULL DEFAULT 0,
  "unsupported_claim_count" integer NOT NULL DEFAULT 0,
  "generic_language_score" integer NOT NULL DEFAULT 0,
  "recommendation" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_quality_report" ADD CONSTRAINT "pqr_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "page_quality_report" ADD CONSTRAINT "pqr_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pqr_run_page_unique" ON "page_quality_report" ("run_id","page_id");
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
  "usefulness_score" integer NOT NULL DEFAULT 0,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_moment_run_video_idx" ON "visual_moment" ("run_id","video_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_moment_run_score_idx" ON "visual_moment" ("run_id","usefulness_score");
