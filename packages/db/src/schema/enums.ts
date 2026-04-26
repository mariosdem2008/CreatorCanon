import { pgEnum } from 'drizzle-orm/pg-core';

// ----- Workspace / membership -----
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'owner',
  'editor',
  'viewer',
]);

// ----- Billing plan -----
export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'enterprise']);

// ----- YouTube -----
export const youtubeConnectionStatusEnum = pgEnum('youtube_connection_status', [
  'connected',
  'revoked',
  'expired',
]);

export const captionStatusEnum = pgEnum('caption_status', [
  'available',
  'auto_only',
  'none',
  'unknown',
]);

// ----- Transcripts / media -----
export const transcriptProviderEnum = pgEnum('transcript_provider', [
  'youtube_captions',
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
  'manual_upload',
]);

export const mediaAssetTypeEnum = pgEnum('media_asset_type', ['audio_m4a']);

// ----- Visual lane -----
export const visualAssetModeEnum = pgEnum('visual_asset_mode', [
  'direct_video',
  'sampled_frames',
]);

export const frameObservationTypeEnum = pgEnum('frame_observation_type', [
  'slide',
  'screen',
  'chart',
  'whiteboard',
  'code',
  'ui',
  'diagram',
  'infographic',
  'other',
]);

export const confidenceEnum = pgEnum('confidence', ['strong', 'moderate', 'weak']);

// ----- Selection / runs -----
export const videoSetStatusEnum = pgEnum('video_set_status', ['draft', 'locked']);

export const runStatusEnum = pgEnum('run_status', [
  'draft',
  'awaiting_payment',
  'queued',
  'running',
  'awaiting_review',
  'published',
  'failed',
  'canceled',
]);

export const stageStatusEnum = pgEnum('stage_status', [
  'pending',
  'running',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'skipped',
]);

// ----- Atoms / knowledge -----
export const modalityEnum = pgEnum('modality', ['text', 'visual', 'multimodal']);

export const atomTypeEnum = pgEnum('atom_type', [
  'claim',
  'principle',
  'framework',
  'step',
  'story',
  'example',
  'quote',
  'opinion',
  'warning',
  'tool',
  'visual_framework',
  'slide_model',
  'diagram',
]);

export const actionabilityEnum = pgEnum('actionability', [
  'descriptive',
  'advisory',
  'procedural',
]);

export const knowledgeEdgeKindEnum = pgEnum('knowledge_edge_kind', [
  'duplicate_of',
  'variant_of',
  'example_of',
  'related_to',
  'contradicts',
  'visually_supports',
  'slide_variant_of',
  'screen_step_of',
]);

// ----- Pages -----
export const pageTypeEnum = pgEnum('page_type', [
  'hub_home',
  'topic_overview',
  'lesson',
  'playbook',
  'framework',
  'about',
]);

export const pageStatusEnum = pgEnum('page_status', [
  'needs_review',
  'reviewed',
  'approved',
]);

export const supportLabelEnum = pgEnum('support_label', [
  'strong',
  'review_recommended',
  'limited',
]);

export const pageAuthorKindEnum = pgEnum('page_author_kind', [
  'pipeline',
  'creator',
  'assisted',
]);

export const citationKindEnum = pgEnum('citation_kind', ['text', 'visual', 'multimodal']);

// ----- Chat index -----
export const chatIndexNamespaceEnum = pgEnum('chat_index_namespace', [
  'page_block',
  'atom',
  'segment',
  'visual_observation',
]);

export const chatMessageRoleEnum = pgEnum('chat_message_role', [
  'user',
  'assistant',
  'system',
]);

// ----- Publish / hub -----
export const hubThemeEnum = pgEnum('hub_theme', ['paper', 'midnight', 'field']);

export const hubAccessModeEnum = pgEnum('hub_access_mode', [
  'public',
  'gated_password',
  'gated_paywall',
]);

export const hubFreePreviewEnum = pgEnum('hub_free_preview', [
  'none',
  'first_lesson',
  'one_per_topic',
  'all',
]);

export const releaseStatusEnum = pgEnum('release_status', [
  'building',
  'preview_ready',
  'live',
  'archived',
  'failed',
]);

export const hubAccessStatusEnum = pgEnum('hub_access_status', [
  'active',
  'canceled',
  'past_due',
]);

// ----- Editing -----
export const editActionEnum = pgEnum('edit_action_kind', [
  'section_regenerate',
  'manual_edit',
  'approve',
  'revert',
  'delete_block',
  'add_block',
  'reorder_block',
]);

// ----- Billing / cost -----
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
]);

export const costProviderEnum = pgEnum('cost_provider', [
  'openai',
  'gemini',
  'youtube',
  'resend',
  'stripe',
  'r2',
]);

export const costUserInteractionEnum = pgEnum('cost_user_interaction', [
  'pipeline',
  'editor_regen',
  'chat_answer',
  'admin_rerun',
]);

// ----- Atlas agent / inbox -----
export const agentSuggestionStatusEnum = pgEnum('agent_suggestion_status', [
  'pending',
  'accepted',
  'dismissed',
]);

export const agentSuggestionKindEnum = pgEnum('agent_suggestion_kind', [
  'connect_source',
  'pick_focus_set',
  'configure_project',
  'review_run',
  'publish_release',
  'edit_section',
  'expand_archive',
]);

export const inboxItemStatusEnum = pgEnum('inbox_item_status', [
  'unread',
  'read',
  'archived',
]);

export const inboxItemKindEnum = pgEnum('inbox_item_kind', [
  'run_completed',
  'run_failed',
  'run_awaiting_review',
  'release_published',
  'invite_pending',
  'system_notice',
]);

// ----- Multi-agent pipeline -----
/** Multi-agent pipeline finding category. Stored in `archive_finding.type`. */
export const findingTypeEnum = pgEnum('finding_type', [
  'topic',
  'framework',
  'lesson',
  'playbook',
  'quote',
  'aha_moment',
  'source_ranking',
]);

/** Per-finding grounding verdict assigned by `citation_grounder`. Distinct from
 *  the user-facing `supportLabelEnum` and the visual-lane `confidenceEnum`. */
export const evidenceQualityEnum = pgEnum('evidence_quality', [
  'strong',
  'moderate',
  'limited',
  'unverified',
]);

/** Edges between findings produced by the multi-agent pipeline. Distinct from
 *  `knowledgeEdgeKindEnum` (atom-level edges from the legacy v0 stages). */
export const relationTypeEnum = pgEnum('relation_type', [
  'supports',
  'builds_on',
  'related_to',
  'instance_of',
  'contradicts',
]);

export const hubTemplateKeyEnum = pgEnum('hub_template_key', [
  'editorial_atlas',
  'legacy_v0',
]);
