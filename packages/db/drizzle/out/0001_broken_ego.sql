CREATE TABLE IF NOT EXISTS "allowlist_email" (
	"email" text PRIMARY KEY NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"invited_by_user_id" text,
	"requested_by_ip" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allowlist_email" ADD CONSTRAINT "allowlist_email_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allowlist_email_approved_idx" ON "allowlist_email" USING btree ("approved");