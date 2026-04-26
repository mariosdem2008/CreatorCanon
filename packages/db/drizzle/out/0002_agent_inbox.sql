DO $$ BEGIN
 CREATE TYPE "public"."agent_suggestion_kind" AS ENUM('connect_source', 'pick_focus_set', 'configure_project', 'review_run', 'publish_release', 'edit_section', 'expand_archive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."agent_suggestion_status" AS ENUM('pending', 'accepted', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inbox_item_kind" AS ENUM('run_completed', 'run_failed', 'run_awaiting_review', 'release_published', 'invite_pending', 'system_notice');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inbox_item_status" AS ENUM('unread', 'read', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "agent_suggestion_kind" NOT NULL,
	"status" "agent_suggestion_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"target_ref" text,
	"metadata" jsonb,
	"actioned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actioned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_item" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"kind" "inbox_item_kind" NOT NULL,
	"status" "inbox_item_status" DEFAULT 'unread' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"target_ref" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_suggestion" ADD CONSTRAINT "agent_suggestion_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_suggestion" ADD CONSTRAINT "agent_suggestion_actioned_by_user_id_user_id_fk" FOREIGN KEY ("actioned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_suggestion_workspace_created_idx" ON "agent_suggestion" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_suggestion_workspace_status_idx" ON "agent_suggestion" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_item_workspace_created_idx" ON "inbox_item" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_item_workspace_status_idx" ON "inbox_item" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_item_user_idx" ON "inbox_item" USING btree ("user_id");