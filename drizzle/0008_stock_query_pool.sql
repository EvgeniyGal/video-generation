-- Stock image query pool cache on carousel drafts
ALTER TABLE "vc_carousel_drafts"
  ADD COLUMN IF NOT EXISTS "stock_query_pool" jsonb DEFAULT NULL;
