-- Add whisper-1 to transcript_provider enum
-- (the worker switched from gpt-4o-mini-transcribe to whisper-1 because the
-- newer model dropped verbose_json + segment timestamps support).
ALTER TYPE "transcript_provider" ADD VALUE IF NOT EXISTS 'whisper-1';
