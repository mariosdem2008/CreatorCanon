CREATE TABLE IF NOT EXISTS "synthesis_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"product_goal" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"composer_call_count" integer DEFAULT 0 NOT NULL,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"synthesis_run_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "synthesis_run" ADD CONSTRAINT "synthesis_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "synthesis_run" ADD CONSTRAINT "synthesis_run_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_bundle" ADD CONSTRAINT "product_bundle_synthesis_run_id_synthesis_run_id_fk" FOREIGN KEY ("synthesis_run_id") REFERENCES "public"."synthesis_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_bundle" ADD CONSTRAINT "product_bundle_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_bundle" ADD CONSTRAINT "product_bundle_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "synthesis_run_run_idx" ON "synthesis_run" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "synthesis_run_status_created_idx" ON "synthesis_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_bundle_synthesis_run_unique" ON "product_bundle" USING btree ("synthesis_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_bundle_run_idx" ON "product_bundle" USING btree ("run_id");
