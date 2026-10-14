-- Content blueprints: directing DNA for slideshow / HeyGen / carousel.

CREATE TABLE IF NOT EXISTS "vc_blueprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "brand_tone" text DEFAULT '' NOT NULL,
  "visual_style" text DEFAULT '' NOT NULL,
  "language" text DEFAULT 'ua' NOT NULL,
  "defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "drama_notes" text DEFAULT '' NOT NULL,
  "visual_arc_notes" text DEFAULT '' NOT NULL,
  "subtitle_notes" text DEFAULT '' NOT NULL,
  "source_review" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF to_regclass('public.vc_blueprints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.vc_blueprints ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.vc_blueprints FORCE ROW LEVEL SECURITY';
    BEGIN
      EXECUTE 'REVOKE ALL ON TABLE public.vc_blueprints FROM PUBLIC';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    BEGIN
      EXECUTE 'REVOKE ALL ON TABLE public.vc_blueprints FROM anon';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
    BEGIN
      EXECUTE 'REVOKE ALL ON TABLE public.vc_blueprints FROM authenticated';
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END IF;
END $$;
