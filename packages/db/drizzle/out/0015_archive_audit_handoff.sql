DO $$ BEGIN
 CREATE TYPE "public"."archive_audit_status" AS ENUM('queued', 'running', 'succeeded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archive_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "archive_audit_status" DEFAULT 'queued' NOT NULL,
	"input_url" text NOT NULL,
	"canonical_channel_url" text,
	"channel_id" text,
	"channel_title" text,
	"channel_handle" text,
	"ip_hash" text,
	"video_count_scanned" integer DEFAULT 0 NOT NULL,
	"transcript_count_scanned" integer DEFAULT 0 NOT NULL,
	"report" jsonb,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_hub_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"release_id" text,
	"actor_user_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"auto_publish" boolean DEFAULT true NOT NULL,
	"design_spec" jsonb,
	"error_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_audit_id_archive_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."archive_audit"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_hub_id_hub_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hub"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_hub_generation" ADD CONSTRAINT "audit_hub_generation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_audit_channel_idx" ON "archive_audit" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_audit_ip_created_idx" ON "archive_audit" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_audit_status_created_idx" ON "archive_audit" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_hub_generation_audit_workspace_unique" ON "audit_hub_generation" USING btree ("audit_id","workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_hub_generation_run_idx" ON "audit_hub_generation" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_hub_generation_status_idx" ON "audit_hub_generation" USING btree ("status","created_at");
