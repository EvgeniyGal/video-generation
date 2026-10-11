-- Enable RLS on all Reels Studio (vc_*) tables.
-- No policies for anon/authenticated: PostgREST public access is denied.
-- App access uses postgres / service_role, which bypass RLS.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'vc_users',
    'vc_integration_credentials',
    'vc_app_settings',
    'vc_buffer_accounts',
    'vc_buffer_channels',
    'vc_ideas',
    'vc_reel_drafts',
    'vc_videos',
    'vc_scheduled_posts',
    'vc_post_metrics'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

      -- Drop open grants if roles exist (self-hosted / cloud Supabase).
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
      EXCEPTION WHEN undefined_object THEN
        NULL;
      END;
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXCEPTION WHEN undefined_object THEN
        NULL;
      END;
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      EXCEPTION WHEN undefined_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;
