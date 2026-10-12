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
    const result: {
      items: T[];
      hasMore: boolean;
      nextToken: string | null;
    } = await heygenListPage<T>(apiKey, buildPath(token));
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

export type HeyGenUserMe = {
  username?: string;
  email?: string;
  billing_type?: "wallet" | "subscription" | "usage_based" | string | null;
  wallet?: {
    currency?: string | null;
    remaining_balance?: number | null;
  } | null;
  subscription?: {
    plan?: string | null;
    credits?: {
      premium_credits?: { remaining?: number | null; resets_at?: string | null };
      add_on_credits?: { remaining?: number | null; resets_at?: string | null };
    } | null;
  } | null;
  usage_based?: {
    spending_current_usd?: number | null;
    spending_cap_usd?: number | null;
    included_credits?: number | null;
    remaining_credits?: number | null;
  } | null;
};

export async function getHeyGenCurrentUser(apiKey: string) {
  return heygenFetch<HeyGenUserMe>(apiKey, "/v3/users/me");
}

/** Normalize HeyGen billing into a short remaining balance summary. */
export function summarizeHeyGenCredits(user: HeyGenUserMe): {
  remainingLabel: string;
  detail?: string;
} {
  const type = user.billing_type ?? null;
  if (type === "wallet" && user.wallet) {
    const bal = user.wallet.remaining_balance;
    const currency = (user.wallet.currency || "usd").toUpperCase();
    return {
      remainingLabel:
        bal == null ? "—" : `${formatNum(bal)} ${currency}`,
      detail: "wallet",
    };
  }
  if (type === "subscription" && user.subscription) {
    const premium = user.subscription.credits?.premium_credits?.remaining ?? 0;
    const addon = user.subscription.credits?.add_on_credits?.remaining ?? 0;
    const total = Number(premium) + Number(addon);
    return {
      remainingLabel: `${formatNum(total)} credits`,
      detail: user.subscription.plan
        ? `plan: ${user.subscription.plan}`
        : undefined,
    };
  }
  if (type === "usage_based" && user.usage_based) {
    const rem = user.usage_based.remaining_credits;
    const spent = user.usage_based.spending_current_usd;
    const cap = user.usage_based.spending_cap_usd;
    return {
      remainingLabel:
        rem != null ? `${formatNum(rem)} credits` : "usage-based",
      detail:
        spent != null && cap != null
          ? `spent $${formatNum(spent)} / cap $${formatNum(cap)}`
          : undefined,
    };
  }
  return { remainingLabel: "—" };
}

function formatNum(n: number) {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
