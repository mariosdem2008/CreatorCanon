-- Backfill voiceMode='reader_second_person' for any existing project.config
-- that doesn't yet carry the field. JSONB merge — no schema change.
UPDATE "project"
SET "config" = COALESCE("config", '{}'::jsonb) || jsonb_build_object('voiceMode', 'reader_second_person')
WHERE NOT (COALESCE("config", '{}'::jsonb) ? 'voiceMode');
