export const ADMIN_RERUN_STAGES = [
  'import_selection_snapshot',
  'ensure_transcripts',
  'normalize_transcripts',
  'segment_transcripts',
  'synthesize_v0_review',
  'draft_pages_v0',
] as const;

export type AdminRerunStage = (typeof ADMIN_RERUN_STAGES)[number];
