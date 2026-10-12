import OpenAI from "openai";
import { z } from "zod";

export const CONTENT_LANGUAGES = ["en", "ua"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export function isContentLanguage(value: string): value is ContentLanguage {
  return (CONTENT_LANGUAGES as readonly string[]).includes(value);
}

export function contentLanguageLabel(language: ContentLanguage): string {
  return language === "ua" ? "Ukrainian" : "English";
}

export const reelContentSchema = z.object({
  hook: z.string(),
  script: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  visualStyle: z.string(),
  suggestedDurationSec: z.number().int().min(5).max(90).optional(),
});

export type ReelContent = z.infer<typeof reelContentSchema> & {
  suggestedDurationSec: number;
  language: ContentLanguage;
};

const SYSTEM_PROMPT = `You are an expert short-form video strategist for Instagram Reels, TikTok, and YouTube Shorts.
Given a reel idea, produce content optimized for watch time and virality.

Rules:
- Hook must grab attention in the first 1-3 seconds (curiosity, bold claim, or pattern interrupt).
- Script should be spoken aloud, conversational, punchy, and fit the requested target duration when read at a natural pace.
- Caption should complement the video, include a soft CTA, stay platform-friendly.
- Hashtags: 5-12 relevant tags without # prefix in the JSON array values (or with # — either is fine).
- visualStyle describes how the video should look for an AI video agent (avatar, B-roll vibe, text overlays, pacing, lighting). Write visualStyle in English so production tools can follow it, even when spoken content is in another language.
- Prefer concrete, specific wording over vague hype.
- ALL user-facing text (hook, script, caption, cta, hashtags) MUST be written in the requested content language.
Return ONLY valid JSON matching the schema.`;

export async function generateReelContent(params: {
  apiKey: string;
  idea: string;
  brandTone?: string;
  globalStyle?: string;
  model?: string;
  language: ContentLanguage;
  targetDurationSec: number;
}): Promise<ReelContent> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const model = params.model || "gpt-4.1-mini";
  const languageName = contentLanguageLabel(params.language);
  const duration = Math.min(90, Math.max(5, Math.round(params.targetDurationSec)));

  const userParts = [
    `Idea:\n${params.idea}`,
    `Content language: ${languageName} (${params.language}). Write hook, script, caption, cta, and hashtags entirely in ${languageName}.`,
    `Target duration: ${duration} seconds. Size the spoken script so it fits this length at a natural speaking pace.`,
    params.brandTone ? `Brand / tone:\n${params.brandTone}` : null,
    params.globalStyle ? `Visual / production style:\n${params.globalStyle}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${userParts}

Respond with JSON keys: hook, script, caption, hashtags (string array), cta, visualStyle.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty content");

  const parsed = reelContentSchema.parse(JSON.parse(raw));
  parsed.hashtags = parsed.hashtags.map((t) =>
    t.startsWith("#") ? t.slice(1) : t,
  );

  return {
    ...parsed,
    suggestedDurationSec: duration,
    language: params.language,
  };
}

export function buildHeyGenPrompt(content: {
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  cta: string;
  visualStyle: string;
  suggestedDurationSec: number;
  language?: string | null;
}): string {
  const lang =
    content.language && isContentLanguage(content.language)
      ? content.language
      : "en";
  const languageName = contentLanguageLabel(lang);

  return [
    `Create a vertical portrait short-form social reel (9:16).`,
    `Spoken language and on-screen text language: ${languageName}. The presenter must speak ${languageName}. Subtitles/captions must be in ${languageName}.`,
    `Target duration about ${content.suggestedDurationSec} seconds. Keep the final video close to this length.`,
    `Opening hook (on-screen / spoken): ${content.hook}`,
    `Spoken script:\n${content.script}`,
    `Visual style and production notes:\n${content.visualStyle}`,
    `End with a clear call to action: ${content.cta}`,
    `Include burned-in captions/subtitles suitable for silent autoplay.`,
    `Keep pacing energetic and retention-focused for Reels/TikTok.`,
  ].join("\n\n");
}

/** Models useful for chat / structured content generation. */
const CHAT_MODEL_HINT =
  /^(gpt-|o[1-9]|chatgpt-|ft:gpt-)/i;

const IMAGE_MODEL_HINT = /^(gpt-image-|chatgpt-image-)/i;

export async function listChatModels(apiKey: string): Promise<string[]> {
  const client = new OpenAI({ apiKey });
  const page = await client.models.list();
  const ids = page.data
    .map((m) => m.id)
    .filter((id) => CHAT_MODEL_HINT.test(id))
    .sort((a, b) => a.localeCompare(b));

  // Prefer newer gpt / o-series first in UI by reversing alpha within groups
  return ids.sort((a, b) => {
    const rank = (id: string) => {
      if (id.startsWith("gpt-5") || id.startsWith("gpt-6")) return 0;
      if (id.startsWith("gpt-4.1")) return 1;
      if (id.startsWith("gpt-4o")) return 2;
      if (id.startsWith("o3") || id.startsWith("o4") || id.startsWith("o1")) return 3;
      if (id.startsWith("gpt-4")) return 4;
      if (id.startsWith("gpt-3.5")) return 9;
      return 5;
    };
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

export async function listImageModels(apiKey: string): Promise<string[]> {
  const client = new OpenAI({ apiKey });
  const page = await client.models.list();
  const ids = page.data
    .map((m) => m.id)
    .filter((id) => IMAGE_MODEL_HINT.test(id));

  const curatedFallback = [
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
  ];

  const merged = [...new Set([...ids, ...curatedFallback])];

  return merged.sort((a, b) => {
    const rank = (id: string) => {
      if (id.includes("2.5-flare")) return 0;
      if (id.includes("2.5-sunburst")) return 1;
      if (id.startsWith("gpt-image-2")) return 2;
      if (id.includes("1.5")) return 3;
      if (id.includes("1-mini")) return 5;
      if (id.startsWith("gpt-image-1")) return 4;
      return 6;
    };
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}
