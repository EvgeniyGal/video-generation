const ELEVEN_API = "https://api.elevenlabs.io/v1";

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
};

export type ElevenLabsWord = {
  type: string;
  text: string;
  start: number;
  end: number;
};

async function elevenFetch<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${ELEVEN_API}${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export async function listElevenLabsVoices(
  apiKey: string,
): Promise<ElevenLabsVoice[]> {
  const data = await elevenFetch<{ voices: ElevenLabsVoice[] }>(
    apiKey,
    "/voices",
  );
  return (data.voices ?? []).sort((a, b) =>
    (a.name || a.voice_id).localeCompare(b.name || b.voice_id),
  );
}

export type ElevenLabsSubscription = {
  tier?: string;
  character_count?: number;
  character_limit?: number;
  status?: string;
  next_character_count_reset_unix?: number | null;
};

export async function getElevenLabsSubscription(apiKey: string) {
  return elevenFetch<ElevenLabsSubscription>(apiKey, "/user/subscription");
}

export function summarizeElevenLabsCredits(sub: ElevenLabsSubscription): {
  remaining: number | null;
  used: number | null;
  limit: number | null;
  remainingLabel: string;
  detail?: string;
} {
  const used = sub.character_count ?? null;
  const limit = sub.character_limit ?? null;
  const remaining =
    used != null && limit != null ? Math.max(0, limit - used) : null;
  const parts: string[] = [];
  if (sub.tier) parts.push(sub.tier);
  if (sub.next_character_count_reset_unix) {
    const d = new Date(sub.next_character_count_reset_unix * 1000);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`resets ${d.toLocaleDateString()}`);
    }
  }
  return {
    remaining,
    used,
    limit,
    remainingLabel:
      remaining != null && limit != null
        ? `${remaining.toLocaleString()} / ${limit.toLocaleString()} credits`
        : "—",
    detail: parts.length ? parts.join(" · ") : undefined,
  };
}

export async function synthesizeSpeech(params: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<Buffer> {
  const modelId = params.modelId || "eleven_v3";
  const res = await fetch(
    `${ELEVEN_API}/text-to-speech/${encodeURIComponent(params.voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": params.apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.8,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function transcribeWithWordTimestamps(params: {
  apiKey: string;
  audio: Buffer;
  filename?: string;
}): Promise<{ words: ElevenLabsWord[]; audio_duration_secs?: number }> {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  const blob = new Blob([new Uint8Array(params.audio)], { type: "audio/mpeg" });
  form.append("file", blob, params.filename || "speech.mp3");

  const res = await fetch(`${ELEVEN_API}/speech-to-text`, {
    method: "POST",
    headers: {
      "xi-api-key": params.apiKey,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs Scribe failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }
  const data = (await res.json()) as {
    words?: ElevenLabsWord[];
    audio_duration_secs?: number;
  };
  return {
    words: data.words ?? [],
    audio_duration_secs: data.audio_duration_secs,
  };
}
