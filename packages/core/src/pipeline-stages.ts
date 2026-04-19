export const PIPELINE_VERSION = 'v1.0.0' as const;

export const PIPELINE_STAGES = [
  'ensure_transcripts',
  'ensure_visual_assets',
  'normalize_transcripts',
  'segment',
  'extract_text_atoms',
  'extract_visual_observations',
  'merge_multimodal_atoms',
  'video_memos',
  'cluster_atoms',
  'outline_hub',
  'draft_pages',
  'qa_citations',
  'index_chat',
  'build_release',
  'publish_release',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const isPipelineStage = (s: string): s is PipelineStage =>
  (PIPELINE_STAGES as readonly string[]).includes(s);
