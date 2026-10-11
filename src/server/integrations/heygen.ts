const HEYGEN_API = "https://api.heygen.com";

async function heygenFetch<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${HEYGEN_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json()) as {
    data?: T;
    error?: { message?: string; code?: string };
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      json.error?.message || json.message || `HeyGen HTTP ${res.status}`,
    );
  }
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  return (json.data ?? json) as T;
}

export type HeyGenVoice = {
  voice_id: string;
  language?: string;
  gender?: string;
  name?: string;
  preview_audio?: string;
};

export async function listVoices(apiKey: string) {
  const data = await heygenFetch<{ voices?: HeyGenVoice[] } | HeyGenVoice[]>(
    apiKey,
    "/v3/voices",
  );
  if (Array.isArray(data)) return data;
  return data.voices ?? [];
}

export async function createVideoAgentSession(
  apiKey: string,
  params: {
    prompt: string;
    voiceId?: string | null;
    avatarId?: string | null;
    styleId?: string | null;
    orientation?: "portrait" | "landscape";
  },
) {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    mode: "generate",
    orientation: params.orientation ?? "portrait",
  };
  if (params.voiceId) body.voice_id = params.voiceId;
  if (params.avatarId) body.avatar_id = params.avatarId;
  if (params.styleId) body.style_id = params.styleId;

  return heygenFetch<{
    session_id: string;
    status: string;
    video_id: string | null;
  }>(apiKey, "/v3/video-agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getVideoAgentSession(apiKey: string, sessionId: string) {
  return heygenFetch<{
    session_id: string;
    status: string;
    video_id: string | null;
    progress?: number;
    error?: string;
  }>(apiKey, `/v3/video-agents/${sessionId}`);
}

export async function getVideo(apiKey: string, videoId: string) {
  return heygenFetch<{
    id: string;
    status: string;
    video_url?: string;
    thumbnail_url?: string;
    duration?: number;
    captioned_video_url?: string;
    error?: string;
  }>(apiKey, `/v3/videos/${videoId}`);
}
