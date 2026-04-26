DO $$ BEGIN
 CREATE TYPE "public"."source_kind" AS ENUM('youtube', 'manual_upload');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transcribe_status" AS ENUM('pending', 'transcribing', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."upload_status" AS ENUM('uploading', 'uploaded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "channel" ALTER COLUMN "youtube_channel_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ALTER COLUMN "youtube_video_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel" ADD COLUMN "source_kind" "source_kind" DEFAULT 'youtube' NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "source_kind" "source_kind" DEFAULT 'youtube' NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "local_r2_key" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "upload_status" "upload_status";--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcribe_status" "transcribe_status";--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "content_type" text;

--> Partial unique indexes — uniqueness only enforced for non-null values
DROP INDEX IF EXISTS "channel_youtube_channel_id_unique";
CREATE UNIQUE INDEX "channel_youtube_channel_id_unique"
  ON "channel" USING btree ("youtube_channel_id")
  WHERE "youtube_channel_id" IS NOT NULL;

DROP INDEX IF EXISTS "video_workspace_youtube_id_unique";
CREATE UNIQUE INDEX "video_workspace_youtube_id_unique"
  ON "video" USING btree ("workspace_id", "youtube_video_id")
  WHERE "youtube_video_id" IS NOT NULL;

--> CHECK constraint to enforce manual_upload videos have local_r2_key
ALTER TABLE "video" ADD CONSTRAINT "video_manual_upload_has_r2_key"
  CHECK (source_kind <> 'manual_upload' OR local_r2_key IS NOT NULL);