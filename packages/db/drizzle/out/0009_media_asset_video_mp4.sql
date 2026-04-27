-- Add 'video_mp4' to the media_asset_type enum so visual-context can query
-- mediaAsset rows for video sources. Phase 10 wires the upload pipeline to
-- persist these rows; this migration only widens the enum.
ALTER TYPE "public"."media_asset_type" ADD VALUE IF NOT EXISTS 'video_mp4';
