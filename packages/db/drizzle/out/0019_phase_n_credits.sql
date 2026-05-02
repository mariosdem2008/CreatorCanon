-- Phase N — credit ledger.
-- Append-only `credit_event` log + materialized `credit_balance` snapshot.
-- Idempotency on UNIQUE(source, reference); FK to user.id (text).

CREATE TABLE IF NOT EXISTS "credit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" varchar(24) NOT NULL,
	"delta" integer NOT NULL,
	"source" varchar(96) NOT NULL,
	"reference" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_balance" (
	"user_id" text NOT NULL,
	"kind" varchar(24) NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_balance_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_event" ADD CONSTRAINT "credit_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_balance" ADD CONSTRAINT "credit_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_event_source_reference_unique" ON "credit_event" USING btree ("source","reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_event_user_kind_idx" ON "credit_event" USING btree ("user_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_event_user_created_idx" ON "credit_event" USING btree ("user_id","created_at");
