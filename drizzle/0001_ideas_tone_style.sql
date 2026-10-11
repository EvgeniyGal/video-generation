-- Per-idea brand tone and visual style (safe to run if columns already exist).
ALTER TABLE "vc_ideas" ADD COLUMN IF NOT EXISTS "brand_tone" text DEFAULT '' NOT NULL;
ALTER TABLE "vc_ideas" ADD COLUMN IF NOT EXISTS "visual_style" text DEFAULT '' NOT NULL;
