-- Content language for AI drafts / HeyGen prompts (safe to re-run).
ALTER TABLE "vc_reel_drafts" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en' NOT NULL;
