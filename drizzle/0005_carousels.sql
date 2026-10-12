-- Photo carousel factory tables + scheduled_posts media either video or carousel.

CREATE TABLE IF NOT EXISTS "vc_carousel_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hook" text DEFAULT '' NOT NULL,
  "caption" text DEFAULT '' NOT NULL,
  "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "language" text DEFAULT 'en' NOT NULL,
  "niche" text DEFAULT '' NOT NULL,
  "audience" text DEFAULT '' NOT NULL,
  "product_mention" text DEFAULT '' NOT NULL,
  "slides" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vc_carousels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "carousel_draft_id" uuid NOT NULL REFERENCES "vc_carousel_drafts"("id") ON DELETE CASCADE,
  "slide_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "storage_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "job_payload" jsonb,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "vc_scheduled_posts" ALTER COLUMN "video_id" DROP NOT NULL;
ALTER TABLE "vc_scheduled_posts" ADD COLUMN IF NOT EXISTS "carousel_id" uuid REFERENCES "vc_carousels"("id") ON DELETE CASCADE;
ALTER TABLE "vc_scheduled_posts" ADD COLUMN IF NOT EXISTS "carousel_draft_id" uuid REFERENCES "vc_carousel_drafts"("id") ON DELETE SET NULL;

-- RLS for new tables (same posture as 0002)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['vc_carousel_drafts', 'vc_carousels'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
      EXCEPTION WHEN undefined_object THEN NULL;
      END;
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXCEPTION WHEN undefined_object THEN NULL;
      END;
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      EXCEPTION WHEN undefined_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;
