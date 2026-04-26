-- Partial index for orphaned-uploads-sweep: scopes to manual-upload rows still in flight.
CREATE INDEX IF NOT EXISTS "video_uploading_created_at_idx"
  ON "video" USING btree ("upload_status", "created_at")
  WHERE "upload_status" = 'uploading';
