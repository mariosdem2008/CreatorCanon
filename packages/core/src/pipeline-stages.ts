// Authoritative pipeline stage registry. Names match plan/05-pipeline-plan.md.
//
// Stage 1 is inventory-time (pre-run). Stages 2–16 are the run-time DAG.
// Every stage is idempotent on (run_id, stage_name, input_hash, pipeline_version).

export const PIPELINE_VERSION = 'v1.0.0' as const;

export const PIPELINE_STAGES = [
  'channel_metadata_scan', // 1 — inventory-time
  'import_selection_snapshot', // 2
  'ensure_transcripts', // 3
  'ensure_visual_assets', // 4
  'normalize_transcripts', // 5
  'segment_transcripts', // 6
  'extract_text_atoms', // 7
  'extract_visual_observations', // 8
  'merge_multimodal_atoms', // 9
  'synthesize_videos', // 10
  'cluster_archive', // 11
  'build_outline', // 12
  'draft_pages', // 13
  'qa_and_repair', // 14
  'index_chat', // 15
  'build_release', // 16
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const isPipelineStage = (s: string): s is PipelineStage =>
  (PIPELINE_STAGES as readonly string[]).includes(s);

// Stages that run inside a generation_run (exclude inventory-time Stage 1).
export const RUN_PIPELINE_STAGES = PIPELINE_STAGES.slice(1) as readonly PipelineStage[];
