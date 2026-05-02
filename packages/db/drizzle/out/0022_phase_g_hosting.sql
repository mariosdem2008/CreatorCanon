DO $$ BEGIN
 CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'building', 'live', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"vercel_project_id" varchar(64),
	"vercel_deployment_id" varchar(64),
	"vercel_cert_id" varchar(64),
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"live_url" text,
	"last_error" text,
	"custom_domain" varchar(255),
	"domain_verified" boolean DEFAULT false NOT NULL,
	"ssl_ready" boolean DEFAULT false NOT NULL,
	"domain_attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment" ADD CONSTRAINT "deployment_hub_id_hub_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hub"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_hub_unique" ON "deployment" USING btree ("hub_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_custom_domain_unique" ON "deployment" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_status_idx" ON "deployment" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_vercel_project_idx" ON "deployment" USING btree ("vercel_project_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION deployment_custom_domain_matches_hub()
RETURNS trigger AS $$
DECLARE
	hub_domain varchar(255);
BEGIN
	SELECT "custom_domain"
	INTO hub_domain
	FROM "hub"
	WHERE "id" = NEW."hub_id";

	IF NEW."custom_domain" IS NULL THEN
		NEW."custom_domain" := hub_domain;
	END IF;

	IF hub_domain IS DISTINCT FROM NEW."custom_domain" THEN
		RAISE EXCEPTION 'deployment.custom_domain must match hub.custom_domain for hub_id=%', NEW."hub_id"
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS deployment_custom_domain_matches_hub_trigger ON "deployment";--> statement-breakpoint
CREATE TRIGGER deployment_custom_domain_matches_hub_trigger
BEFORE INSERT OR UPDATE OF "hub_id", "custom_domain" ON "deployment"
FOR EACH ROW EXECUTE FUNCTION deployment_custom_domain_matches_hub();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_deployment_custom_domain_from_hub()
RETURNS trigger AS $$
BEGIN
	UPDATE "deployment"
	SET "custom_domain" = NEW."custom_domain",
		"updated_at" = now()
	WHERE "hub_id" = NEW."id"
		AND "custom_domain" IS DISTINCT FROM NEW."custom_domain";

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS hub_custom_domain_sync_deployment_trigger ON "hub";--> statement-breakpoint
CREATE TRIGGER hub_custom_domain_sync_deployment_trigger
AFTER UPDATE OF "custom_domain" ON "hub"
FOR EACH ROW EXECUTE FUNCTION sync_deployment_custom_domain_from_hub();
