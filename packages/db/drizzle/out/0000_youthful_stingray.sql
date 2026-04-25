DO $$ BEGIN
 CREATE TYPE "public"."actionability" AS ENUM('descriptive', 'advisory', 'procedural');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."atom_type" AS ENUM('claim', 'principle', 'framework', 'step', 'story', 'example', 'quote', 'opinion', 'warning', 'tool', 'visual_framework', 'slide_model', 'diagram');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."caption_status" AS ENUM('available', 'auto_only', 'none', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."chat_index_namespace" AS ENUM('page_block', 'atom', 'segment', 'visual_observation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."citation_kind" AS ENUM('text', 'visual', 'multimodal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."confidence" AS ENUM('strong', 'moderate', 'weak');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cost_provider" AS ENUM('openai', 'gemini', 'youtube', 'resend', 'stripe', 'r2');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cost_user_interaction" AS ENUM('pipeline', 'editor_regen', 'chat_answer', 'admin_rerun');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."edit_action_kind" AS ENUM('section_regenerate', 'manual_edit', 'approve', 'revert', 'delete_block', 'add_block', 'reorder_block');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."frame_observation_type" AS ENUM('slide', 'screen', 'chart', 'whiteboard', 'code', 'ui', 'diagram', 'infographic', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."hub_access_mode" AS ENUM('public', 'gated_password', 'gated_paywall');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."hub_access_status" AS ENUM('active', 'canceled', 'past_due');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."hub_free_preview" AS ENUM('none', 'first_lesson', 'one_per_topic', 'all');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."hub_theme" AS ENUM('paper', 'midnight', 'field');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'uncollectible', 'void');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_edge_kind" AS ENUM('duplicate_of', 'variant_of', 'example_of', 'related_to', 'contradicts', 'visually_supports', 'slide_variant_of', 'screen_step_of');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."media_asset_type" AS ENUM('audio_m4a');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."modality" AS ENUM('text', 'visual', 'multimodal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."page_author_kind" AS ENUM('pipeline', 'creator', 'assisted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."page_status" AS ENUM('needs_review', 'reviewed', 'approved');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."page_type" AS ENUM('hub_home', 'topic_overview', 'lesson', 'playbook', 'framework', 'about');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'enterprise');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."release_status" AS ENUM('building', 'preview_ready', 'live', 'archived', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."run_status" AS ENUM('draft', 'awaiting_payment', 'queued', 'running', 'awaiting_review', 'published', 'failed', 'canceled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."stage_status" AS ENUM('pending', 'running', 'succeeded', 'failed_retryable', 'failed_terminal', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."support_label" AS ENUM('strong', 'review_recommended', 'limited');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transcript_provider" AS ENUM('youtube_captions', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'manual_upload');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."video_set_status" AS ENUM('draft', 'locked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."visual_asset_mode" AS ENUM('direct_video', 'sampled_frames');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'editor', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."youtube_connection_status" AS ENUM('connected', 'revoked', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"avatar_url" text,
	"google_sub" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"stripe_customer_id" text,
	"onboarding_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_member" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'owner' NOT NULL,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"youtube_channel_id" text NOT NULL,
	"title" text,
	"handle" text,
	"description" text,
	"subs_count" integer,
	"video_count" integer,
	"uploads_playlist_id" text,
	"country" text,
	"language" text,
	"avatar_url" text,
	"banner_url" text,
	"metadata_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text,
	"description" text,
	"published_at" timestamp with time zone,
	"duration_seconds" integer,
	"view_count" bigint,
	"like_count" bigint,
	"thumbnails" jsonb,
	"categories" text[],
	"tags" text[],
	"default_language" text,
	"caption_status" "caption_status" DEFAULT 'unknown' NOT NULL,
	"excluded_from_selection" boolean DEFAULT false NOT NULL,
	"metadata_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"video_id" text NOT NULL,
	"view_count" bigint,
	"like_count" bigint,
	"comment_count" bigint,
	"quality_score" double precision,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"google_sub" text NOT NULL,
	"access_token_enc" "bytea" NOT NULL,
	"refresh_token_enc" "bytea" NOT NULL,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "youtube_connection_status" DEFAULT 'connected' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"video_set_id" text,
	"title" text NOT NULL,
	"config" jsonb,
	"current_run_id" text,
	"published_hub_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_set_item" (
	"id" text PRIMARY KEY NOT NULL,
	"video_set_id" text NOT NULL,
	"video_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_set" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"total_duration_seconds" integer DEFAULT 0 NOT NULL,
	"total_transcript_words" integer DEFAULT 0 NOT NULL,
	"status" "video_set_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"video_set_id" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"config_hash" text NOT NULL,
	"status" "run_status" DEFAULT 'draft' NOT NULL,
	"selected_duration_seconds" integer DEFAULT 0 NOT NULL,
	"selected_word_count" integer DEFAULT 0 NOT NULL,
	"price_cents" integer,
	"stripe_payment_intent_id" text,
	"cost_cents_actual" numeric(12, 4) DEFAULT '0' NOT NULL,
	"quality_metrics" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generation_stage_run" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"stage_name" text NOT NULL,
	"input_hash" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"status" "stage_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"artifact_r2_key" text,
	"artifact_size_bytes" integer,
	"input_json" jsonb,
	"output_json" jsonb,
	"error_json" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"video_id" text NOT NULL,
	"type" "media_asset_type" NOT NULL,
	"r2_key" text NOT NULL,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "normalized_transcript_version" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"video_id" text NOT NULL,
	"transcript_asset_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sentence_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "segment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"video_id" text NOT NULL,
	"normalized_transcript_version_id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"tags" text[],
	"summary" text,
	"metadata" jsonb,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transcript_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"video_id" text NOT NULL,
	"provider" "transcript_provider" NOT NULL,
	"language" text,
	"r2_key" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"quality_score" double precision,
	"is_canonical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "frame_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"visual_asset_id" text NOT NULL,
	"timestamp_ms" integer NOT NULL,
	"r2_key" text NOT NULL,
	"ocr_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "frame_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"video_id" text NOT NULL,
	"visual_asset_id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"observation_type" "frame_observation_type" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"text_extracted" text,
	"entities" jsonb,
	"confidence" "confidence" DEFAULT 'moderate' NOT NULL,
	"embedding" vector(1536),
	"representative_frame_r2_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visual_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"video_id" text NOT NULL,
	"mode" "visual_asset_mode" NOT NULL,
	"r2_key_or_url" text NOT NULL,
	"sampling_fps" double precision,
	"duration_seconds" integer,
	"density_score" double precision,
	"should_extract" boolean DEFAULT false NOT NULL,
	"gemini_file_handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_atom" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"type" "atom_type" NOT NULL,
	"modality" "modality" DEFAULT 'text' NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"actionability" "actionability",
	"confidence" "confidence" DEFAULT 'moderate' NOT NULL,
	"source_refs" jsonb NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_edge" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"from_atom_id" text NOT NULL,
	"to_atom_id" text NOT NULL,
	"kind" "knowledge_edge_kind" NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cluster" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"title" text NOT NULL,
	"eyebrow" text,
	"description" text,
	"palette" integer,
	"cohesion_score" double precision,
	"position" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cluster_membership" (
	"cluster_id" text NOT NULL,
	"atom_id" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cluster_membership_cluster_id_atom_id_pk" PRIMARY KEY("cluster_id","atom_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_memo" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"video_id" text NOT NULL,
	"thesis" text,
	"summary" text,
	"pull_quotes" jsonb,
	"top_atom_ids" jsonb,
	"themes" jsonb,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edit_action" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"page_version_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"block_id" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"prompt_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"cluster_id" text,
	"slug" text NOT NULL,
	"page_type" "page_type" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"current_version_id" text,
	"status" "page_status" DEFAULT 'needs_review' NOT NULL,
	"support_label" "support_label" DEFAULT 'review_recommended' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_block" (
	"id" text PRIMARY KEY NOT NULL,
	"page_version_id" text NOT NULL,
	"block_id" text NOT NULL,
	"block_type" text NOT NULL,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"support_label" "support_label",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_citation" (
	"id" text PRIMARY KEY NOT NULL,
	"page_version_id" text NOT NULL,
	"block_id" text NOT NULL,
	"atom_id" text NOT NULL,
	"segment_id" text,
	"frame_observation_id" text,
	"video_id" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"quote_text" text,
	"visual_r2_key" text,
	"citation_kind" "citation_kind" DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_version" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"run_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"summary" text,
	"block_tree_json" jsonb NOT NULL,
	"author_kind" "page_author_kind" DEFAULT 'pipeline' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_index_document" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"release_id" text,
	"namespace" "chat_index_namespace" NOT NULL,
	"source_id" text NOT NULL,
	"text" text NOT NULL,
	"metadata" jsonb,
	"embedding" vector(1536),
	"tsv" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"structured" jsonb,
	"retrieval_trace" jsonb,
	"token_counts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_session" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"hub_id" text,
	"viewer_id" text,
	"viewer_email" text,
	"anonymous_id" text,
	"title" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"subdomain" "citext" NOT NULL,
	"custom_domain" text,
	"theme" "hub_theme" DEFAULT 'paper' NOT NULL,
	"access_mode" "hub_access_mode" DEFAULT 'public' NOT NULL,
	"paywall_price_cents" integer,
	"free_preview" "hub_free_preview" DEFAULT 'first_lesson' NOT NULL,
	"live_release_id" text,
	"preview_release_id" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_subscriber" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"email" "citext" NOT NULL,
	"name" text,
	"stripe_subscription_id" text,
	"access_status" "hub_access_status" DEFAULT 'active' NOT NULL,
	"is_free" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_visit" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"release_id" text,
	"page_slug" text,
	"visitor_id" text,
	"referrer" text,
	"user_agent" text,
	"ip_hash" text,
	"country" text,
	"duration_ms" integer,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"run_id" text NOT NULL,
	"release_number" integer NOT NULL,
	"status" "release_status" DEFAULT 'building' NOT NULL,
	"manifest_r2_key" text,
	"built_at" timestamp with time zone,
	"live_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cost_ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"run_id" text,
	"stage_name" text,
	"user_interaction" "cost_user_interaction" DEFAULT 'pipeline' NOT NULL,
	"provider" "cost_provider" NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"input_seconds_video" integer,
	"input_frames" integer,
	"duration_ms" integer,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"email" text,
	"default_payment_method_id" text,
	"tax_id" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text,
	"stripe_invoice_id" text NOT NULL,
	"status" "invoice_status" NOT NULL,
	"amount_due_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"hosted_invoice_url" text,
	"pdf_url" text,
	"paid_at" timestamp with time zone,
	"run_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"hub_id" text,
	"kind" text NOT NULL,
	"props" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quality_eval" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"citation_support_rate" double precision,
	"coverage_score" double precision,
	"cluster_cohesion" double precision,
	"contradictions_flagged" integer DEFAULT 0 NOT NULL,
	"unsupported_claims" integer DEFAULT 0 NOT NULL,
	"evaluator_version" text,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace" ADD CONSTRAINT "workspace_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel" ADD CONSTRAINT "channel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video" ADD CONSTRAINT "video_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video" ADD CONSTRAINT "video_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_snapshot" ADD CONSTRAINT "video_snapshot_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_snapshot" ADD CONSTRAINT "video_snapshot_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "youtube_connection" ADD CONSTRAINT "youtube_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_video_set_id_video_set_id_fk" FOREIGN KEY ("video_set_id") REFERENCES "public"."video_set"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_set_item" ADD CONSTRAINT "video_set_item_video_set_id_video_set_id_fk" FOREIGN KEY ("video_set_id") REFERENCES "public"."video_set"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_set_item" ADD CONSTRAINT "video_set_item_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_set" ADD CONSTRAINT "video_set_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_set" ADD CONSTRAINT "video_set_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_run" ADD CONSTRAINT "generation_run_video_set_id_video_set_id_fk" FOREIGN KEY ("video_set_id") REFERENCES "public"."video_set"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_stage_run" ADD CONSTRAINT "generation_stage_run_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "normalized_transcript_version" ADD CONSTRAINT "normalized_transcript_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "normalized_transcript_version" ADD CONSTRAINT "normalized_transcript_version_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "normalized_transcript_version" ADD CONSTRAINT "normalized_transcript_version_transcript_asset_id_transcript_asset_id_fk" FOREIGN KEY ("transcript_asset_id") REFERENCES "public"."transcript_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "segment" ADD CONSTRAINT "segment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "segment" ADD CONSTRAINT "segment_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "segment" ADD CONSTRAINT "segment_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "segment" ADD CONSTRAINT "segment_normalized_transcript_version_id_normalized_transcript_version_id_fk" FOREIGN KEY ("normalized_transcript_version_id") REFERENCES "public"."normalized_transcript_version"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcript_asset" ADD CONSTRAINT "transcript_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcript_asset" ADD CONSTRAINT "transcript_asset_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frame_asset" ADD CONSTRAINT "frame_asset_visual_asset_id_visual_asset_id_fk" FOREIGN KEY ("visual_asset_id") REFERENCES "public"."visual_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frame_observation" ADD CONSTRAINT "frame_observation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frame_observation" ADD CONSTRAINT "frame_observation_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frame_observation" ADD CONSTRAINT "frame_observation_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frame_observation" ADD CONSTRAINT "frame_observation_visual_asset_id_visual_asset_id_fk" FOREIGN KEY ("visual_asset_id") REFERENCES "public"."visual_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_asset" ADD CONSTRAINT "visual_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_asset" ADD CONSTRAINT "visual_asset_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_asset" ADD CONSTRAINT "visual_asset_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_atom" ADD CONSTRAINT "evidence_atom_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_atom" ADD CONSTRAINT "evidence_atom_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_edge" ADD CONSTRAINT "knowledge_edge_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_edge" ADD CONSTRAINT "knowledge_edge_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_edge" ADD CONSTRAINT "knowledge_edge_from_atom_id_evidence_atom_id_fk" FOREIGN KEY ("from_atom_id") REFERENCES "public"."evidence_atom"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_edge" ADD CONSTRAINT "knowledge_edge_to_atom_id_evidence_atom_id_fk" FOREIGN KEY ("to_atom_id") REFERENCES "public"."evidence_atom"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster" ADD CONSTRAINT "cluster_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster" ADD CONSTRAINT "cluster_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster_membership" ADD CONSTRAINT "cluster_membership_cluster_id_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."cluster"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster_membership" ADD CONSTRAINT "cluster_membership_atom_id_evidence_atom_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."evidence_atom"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_memo" ADD CONSTRAINT "video_memo_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_memo" ADD CONSTRAINT "video_memo_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_memo" ADD CONSTRAINT "video_memo_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edit_action" ADD CONSTRAINT "edit_action_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edit_action" ADD CONSTRAINT "edit_action_page_version_id_page_version_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_version"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page" ADD CONSTRAINT "page_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page" ADD CONSTRAINT "page_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page" ADD CONSTRAINT "page_cluster_id_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."cluster"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_block" ADD CONSTRAINT "page_block_page_version_id_page_version_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_version"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_citation" ADD CONSTRAINT "page_citation_page_version_id_page_version_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_version"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_citation" ADD CONSTRAINT "page_citation_atom_id_evidence_atom_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."evidence_atom"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_citation" ADD CONSTRAINT "page_citation_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_citation" ADD CONSTRAINT "page_citation_frame_observation_id_frame_observation_id_fk" FOREIGN KEY ("frame_observation_id") REFERENCES "public"."frame_observation"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_citation" ADD CONSTRAINT "page_citation_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_version" ADD CONSTRAINT "page_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_version" ADD CONSTRAINT "page_version_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_version" ADD CONSTRAINT "page_version_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_index_document" ADD CONSTRAINT "chat_index_document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_index_document" ADD CONSTRAINT "chat_index_document_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_session_id_chat_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hub" ADD CONSTRAINT "hub_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hub" ADD CONSTRAINT "hub_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hub_subscriber" ADD CONSTRAINT "hub_subscriber_hub_id_hub_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hub"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hub_visit" ADD CONSTRAINT "hub_visit_hub_id_hub_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hub"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hub_visit" ADD CONSTRAINT "hub_visit_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release" ADD CONSTRAINT "release_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release" ADD CONSTRAINT "release_hub_id_hub_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hub"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release" ADD CONSTRAINT "release_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_ledger_entry" ADD CONSTRAINT "cost_ledger_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_ledger_entry" ADD CONSTRAINT "cost_ledger_entry_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer" ADD CONSTRAINT "customer_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_event" ADD CONSTRAINT "stripe_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription" ADD CONSTRAINT "subscription_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quality_eval" ADD CONSTRAINT "quality_eval_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quality_eval" ADD CONSTRAINT "quality_eval_run_id_generation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_google_sub_unique" ON "user" USING btree ("google_sub");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_slug_unique" ON "workspace" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_owner_user_id_idx" ON "workspace" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_stripe_customer_id_unique" ON "workspace" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_member_user_id_idx" ON "workspace_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_youtube_channel_id_unique" ON "channel" USING btree ("youtube_channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_workspace_idx" ON "channel" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_workspace_youtube_id_unique" ON "video" USING btree ("workspace_id","youtube_video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_youtube_video_id_idx" ON "video" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_workspace_channel_idx" ON "video" USING btree ("workspace_id","channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_workspace_published_idx" ON "video" USING btree ("workspace_id","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_snapshot_video_captured_idx" ON "video_snapshot" USING btree ("video_id","captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_snapshot_workspace_idx" ON "video_snapshot" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "youtube_connection_workspace_idx" ON "youtube_connection" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_workspace_created_idx" ON "project" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_current_run_idx" ON "project" USING btree ("current_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_set_item_set_video_unique" ON "video_set_item" USING btree ("video_set_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_set_item_set_position_idx" ON "video_set_item" USING btree ("video_set_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_set_item_video_idx" ON "video_set_item" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_set_workspace_created_idx" ON "video_set" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_run_workspace_created_idx" ON "generation_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_run_project_idx" ON "generation_run" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_run_status_idx" ON "generation_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "generation_run_stripe_payment_intent_unique" ON "generation_run" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "generation_stage_run_idempotency_key" ON "generation_stage_run" USING btree ("run_id","stage_name","input_hash","pipeline_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_stage_run_run_stage_idx" ON "generation_stage_run" USING btree ("run_id","stage_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_stage_run_status_idx" ON "generation_stage_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_asset_video_idx" ON "media_asset" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_asset_workspace_idx" ON "media_asset" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "normalized_transcript_version_video_idx" ON "normalized_transcript_version" USING btree ("video_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "normalized_transcript_version_transcript_idx" ON "normalized_transcript_version" USING btree ("transcript_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segment_run_video_start_idx" ON "segment" USING btree ("run_id","video_id","start_ms");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segment_video_range_idx" ON "segment" USING btree ("video_id","start_ms","end_ms");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segment_run_idx" ON "segment" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcript_asset_video_idx" ON "transcript_asset" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcript_asset_workspace_idx" ON "transcript_asset" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcript_asset_provider_idx" ON "transcript_asset" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_asset_visual_asset_ts_idx" ON "frame_asset" USING btree ("visual_asset_id","timestamp_ms");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_observation_video_range_idx" ON "frame_observation" USING btree ("video_id","start_ms","end_ms");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_observation_run_video_idx" ON "frame_observation" USING btree ("run_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_observation_visual_asset_idx" ON "frame_observation" USING btree ("visual_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_observation_type_idx" ON "frame_observation" USING btree ("observation_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_observation_workspace_idx" ON "frame_observation" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visual_asset_run_video_unique" ON "visual_asset" USING btree ("run_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_asset_workspace_idx" ON "visual_asset" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_asset_run_idx" ON "visual_asset" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_atom_run_idx" ON "evidence_atom" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_atom_run_type_idx" ON "evidence_atom" USING btree ("run_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_atom_run_modality_idx" ON "evidence_atom" USING btree ("run_id","modality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_atom_workspace_idx" ON "evidence_atom" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_edge_run_kind_idx" ON "knowledge_edge" USING btree ("run_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_edge_from_idx" ON "knowledge_edge" USING btree ("from_atom_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_edge_to_idx" ON "knowledge_edge" USING btree ("to_atom_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cluster_run_position_idx" ON "cluster" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cluster_workspace_idx" ON "cluster" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cluster_membership_atom_idx" ON "cluster_membership" USING btree ("atom_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_memo_run_video_unique" ON "video_memo" USING btree ("run_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_memo_workspace_idx" ON "video_memo" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edit_action_page_version_created_idx" ON "edit_action" USING btree ("page_version_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edit_action_user_idx" ON "edit_action" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edit_action_workspace_idx" ON "edit_action" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_run_slug_unique" ON "page" USING btree ("run_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_run_position_idx" ON "page" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_cluster_idx" ON "page" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_workspace_idx" ON "page" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_block_version_block_unique" ON "page_block" USING btree ("page_version_id","block_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_block_version_position_idx" ON "page_block" USING btree ("page_version_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_citation_page_version_idx" ON "page_citation" USING btree ("page_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_citation_page_version_block_idx" ON "page_citation" USING btree ("page_version_id","block_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_citation_atom_idx" ON "page_citation" USING btree ("atom_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_citation_video_range_idx" ON "page_citation" USING btree ("video_id","start_ms","end_ms");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_citation_kind_idx" ON "page_citation" USING btree ("citation_kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_version_page_version_unique" ON "page_version" USING btree ("page_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_version_page_created_idx" ON "page_version" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_version_run_idx" ON "page_version" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_index_document_run_namespace_idx" ON "chat_index_document" USING btree ("run_id","namespace");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_index_document_release_namespace_idx" ON "chat_index_document" USING btree ("release_id","namespace");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_index_document_source_idx" ON "chat_index_document" USING btree ("namespace","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_index_document_workspace_idx" ON "chat_index_document" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_session_created_idx" ON "chat_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_role_idx" ON "chat_message" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_session_hub_created_idx" ON "chat_session" USING btree ("hub_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_session_viewer_idx" ON "chat_session" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_session_anonymous_idx" ON "chat_session" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_session_workspace_idx" ON "chat_session" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hub_subdomain_unique" ON "hub" USING btree ("subdomain");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hub_custom_domain_unique" ON "hub" USING btree ("custom_domain");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hub_project_unique" ON "hub" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_workspace_idx" ON "hub" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hub_subscriber_hub_email_unique" ON "hub_subscriber" USING btree ("hub_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_subscriber_hub_created_idx" ON "hub_subscriber" USING btree ("hub_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hub_subscriber_stripe_sub_unique" ON "hub_subscriber" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_subscriber_access_status_idx" ON "hub_subscriber" USING btree ("access_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_visit_hub_occurred_idx" ON "hub_visit" USING btree ("hub_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_visit_release_idx" ON "hub_visit" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_visit_visitor_idx" ON "hub_visit" USING btree ("visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_hub_release_number_unique" ON "release" USING btree ("hub_id","release_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_hub_created_idx" ON "release" USING btree ("hub_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_status_idx" ON "release" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_run_idx" ON "release" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_workspace_idx" ON "release" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_ledger_entry_run_stage_idx" ON "cost_ledger_entry" USING btree ("run_id","stage_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_ledger_entry_provider_model_idx" ON "cost_ledger_entry" USING btree ("provider","model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_ledger_entry_created_idx" ON "cost_ledger_entry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_ledger_entry_workspace_created_idx" ON "cost_ledger_entry" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_workspace_unique" ON "customer" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_stripe_customer_unique" ON "customer" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_stripe_invoice_unique" ON "invoice" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_workspace_created_idx" ON "invoice" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_subscription_idx" ON "invoice" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_customer_idx" ON "invoice" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_event_stripe_event_id_unique" ON "stripe_event" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_event_workspace_received_idx" ON "stripe_event" USING btree ("workspace_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_event_type_idx" ON "stripe_event" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_stripe_sub_unique" ON "subscription" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_workspace_status_idx" ON "subscription" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_customer_idx" ON "subscription" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_event_workspace_occurred_idx" ON "analytics_event" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_event_hub_occurred_idx" ON "analytics_event" USING btree ("hub_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_event_kind_idx" ON "analytics_event" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_workspace_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quality_eval_run_unique" ON "quality_eval" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_eval_workspace_idx" ON "quality_eval" USING btree ("workspace_id");