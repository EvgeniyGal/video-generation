-- Slideshow video provider + job payload (safe to re-run).
ALTER TABLE "vc_videos" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'heygen' NOT NULL;
ALTER TABLE "vc_videos" ADD COLUMN IF NOT EXISTS "job_payload" jsonb;
