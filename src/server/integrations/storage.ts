import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getVideosBucket() {
  return process.env.SUPABASE_VIDEOS_BUCKET || "videos";
}

export async function uploadPublicVideo(params: {
  path: string;
  bytes: Buffer;
  contentType?: string;
}): Promise<{ publicUrl: string; path: string }> {
  const supabase = getSupabaseAdmin();
  const bucket = getVideosBucket();

  const { error } = await supabase.storage.from(bucket).upload(params.path, params.bytes, {
    contentType: params.contentType ?? "video/mp4",
    upsert: true,
  });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(params.path);
  if (!data.publicUrl) {
    throw new Error("Failed to resolve public URL for uploaded video");
  }
  return { publicUrl: data.publicUrl, path: params.path };
}

export async function downloadUrlToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download video (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
