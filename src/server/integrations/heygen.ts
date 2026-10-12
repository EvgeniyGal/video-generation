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
  type?: "public" | "private" | string;
  preview_audio?: string;
  preview_audio_url?: string;
};

export type HeyGenAvatarLook = {
  id: string;
  name?: string;
  gender?: string;
  group_id?: string;
  avatar_type?: string;
  preview_image_url?: string;
  status?: string;
  ownership?: "public" | "private" | string;
};

async function heygenListPage<T>(
  apiKey: string,
  path: string,
): Promise<{ items: T[]; hasMore: boolean; nextToken: string | null }> {
  const res = await fetch(`${HEYGEN_API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
  });
  const json = (await res.json()) as {
    data?: T[] | { voices?: T[]; looks?: T[] };
    voices?: T[];
    looks?: T[];
    has_more?: boolean;
    next_token?: string;
    error?: { message?: string };
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      json.error?.message || json.message || `HeyGen HTTP ${res.status}`,
    );
  }
  if (json.error?.message) throw new Error(json.error.message);

  let items: T[] = [];
  if (Array.isArray(json.data)) {
    items = json.data;
  } else if (json.data && typeof json.data === "object") {
    const nested = json.data as { voices?: T[]; looks?: T[] };
    items = nested.voices ?? nested.looks ?? [];
  } else {
    items = json.voices ?? json.looks ?? [];
  }

  return {
    items,
    hasMore: Boolean(json.has_more),
    nextToken: json.next_token ?? null,
  };
}

async function listAllPages<T>(
  apiKey: string,
  buildPath: (token: string | null) => string,
  maxPages = 10,
): Promise<T[]> {
  const all: T[] = [];
  let token: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await heygenListPage<T>(apiKey, buildPath(token));
    all.push(...result.items);
    if (!result.hasMore || !result.nextToken) break;
    token = result.nextToken;
  }
  return all;
}

export async function listVoices(
  apiKey: string,
  type: "public" | "private" = "public",
) {
  return listAllPages<HeyGenVoice>(
    apiKey,
    (token) => {
      const params = new URLSearchParams({
        type,
        limit: type === "private" ? "100" : "100",
      });
      if (token) params.set("token", token);
      return `/v3/voices?${params}`;
    },
    type === "private" ? 5 : 8,
  );
}

export async function listVoicesGrouped(apiKey: string) {
  const [own, general] = await Promise.all([
    listVoices(apiKey, "private").catch(() => [] as HeyGenVoice[]),
    listVoices(apiKey, "public").catch(() => [] as HeyGenVoice[]),
  ]);
  return {
    own: own.map((v) => ({ ...v, type: "private" as const })),
    general: general.map((v) => ({ ...v, type: "public" as const })),
  };
}

export async function listAvatarLooks(
  apiKey: string,
  ownership: "public" | "private" = "public",
) {
  const looks = await listAllPages<HeyGenAvatarLook>(
    apiKey,
    (token) => {
      const params = new URLSearchParams({
        ownership,
        limit: "50",
      });
      if (token) params.set("token", token);
      return `/v3/avatars/looks?${params}`;
    },
    ownership === "private" ? 5 : 8,
  );
  return looks.filter((look) => !look.status || look.status === "completed");
}

export async function listAvatarsGrouped(apiKey: string) {
  const [own, general] = await Promise.all([
    listAvatarLooks(apiKey, "private").catch(() => [] as HeyGenAvatarLook[]),
    listAvatarLooks(apiKey, "public").catch(() => [] as HeyGenAvatarLook[]),
  ]);
  return {
    own: own.map((a) => ({ ...a, ownership: "private" as const })),
    general: general.map((a) => ({ ...a, ownership: "public" as const })),
  };
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
