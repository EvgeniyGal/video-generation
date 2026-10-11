-- Video Content / Reels Studio tables — all prefixed with vc_ for shared Supabase.

CREATE TABLE IF NOT EXISTS "vc_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_integration_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "encrypted_key" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vc_integration_credentials_provider_idx"
  ON "vc_integration_credentials" ("provider");

CREATE TABLE IF NOT EXISTS "vc_app_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vc_app_settings_key_idx" ON "vc_app_settings" ("key");

CREATE TABLE IF NOT EXISTS "vc_buffer_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "encrypted_api_key" text NOT NULL,
  "organization_id" text,
  "organization_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_buffer_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "buffer_account_id" uuid NOT NULL REFERENCES "vc_buffer_accounts"("id") ON DELETE cascade,
  "channel_id" text NOT NULL,
  "name" text,
  "display_name" text,
  "service" text,
  "avatar" text,
  "synced_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vc_buffer_channels_account_channel_idx"
  ON "vc_buffer_channels" ("buffer_account_id", "channel_id");

CREATE TABLE IF NOT EXISTS "vc_ideas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text,
  "content" text NOT NULL,
  "brand_tone" text DEFAULT '' NOT NULL,
  "visual_style" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_reel_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idea_id" uuid REFERENCES "vc_ideas"("id") ON DELETE set null,
  "hook" text DEFAULT '' NOT NULL,
  "script" text DEFAULT '' NOT NULL,
  "caption" text DEFAULT '' NOT NULL,
  "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cta" text DEFAULT '' NOT NULL,
  "visual_style" text DEFAULT '' NOT NULL,
  "suggested_duration_sec" integer DEFAULT 30,
  "status" text DEFAULT 'draft' NOT NULL,
  "voice_id" text,
  "avatar_id" text,
  "style_id" text,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_videos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reel_draft_id" uuid NOT NULL REFERENCES "vc_reel_drafts"("id") ON DELETE cascade,
  "heygen_session_id" text,
  "heygen_video_id" text,
  "public_url" text,
  "storage_path" text,
  "thumbnail_url" text,
  "duration" real,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_scheduled_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "video_id" uuid NOT NULL REFERENCES "vc_videos"("id") ON DELETE cascade,
  "reel_draft_id" uuid REFERENCES "vc_reel_drafts"("id") ON DELETE set null,
  "buffer_account_id" uuid NOT NULL REFERENCES "vc_buffer_accounts"("id") ON DELETE cascade,
  "buffer_channel_id" uuid NOT NULL REFERENCES "vc_buffer_channels"("id") ON DELETE cascade,
  "buffer_post_id" text,
  "text" text NOT NULL,
  "mode" text DEFAULT 'addToQueue' NOT NULL,
  "due_at" timestamptz,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_post_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scheduled_post_id" uuid NOT NULL REFERENCES "vc_scheduled_posts"("id") ON DELETE cascade,
  "metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metrics_updated_at" timestamptz,
  "captured_at" timestamptz DEFAULT now() NOT NULL
);
