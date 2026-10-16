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

export const carouselContentSchema = z.object({
  hook: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  slides: z
    .array(
      z.object({
        headline: z.string(),
        body: z.string().optional(),
        imagePrompt: z.string(),
      }),
    )
    .min(3)
    .max(10),
});

export type CarouselContent = z.infer<typeof carouselContentSchema> & {
  language: ContentLanguage;
};

const CAROUSEL_SYSTEM_PROMPT = `You are an expert TikTok/Instagram photo-carousel strategist (Vent Now–style listicles).
Given a niche brief, produce one carousel pack optimized for saves and swipe-through.

Rules:
- Slide 1 is the hook: a bold listicle promise (e.g. "5 questions nobody talks about…"). Optionally mark as part of a series.
- Following slides are concrete tips/questions/items; short headline + optional 1–2 sentence body.
- Soft product mention ONLY: if a product name is provided, mention it casually once on a mid-carousel slide (never slide 1, never as a hard CTA). No logos, no "download the app", no "link in bio".
- If no product is provided, do not invent one.
- imagePrompt is ALWAYS in English: candid phone-photo aesthetic, lifestyle/mood matching the niche, natural lighting, NO text, NO logos, NO watermarks in the image.
- Caption: short, platform-friendly, soft engagement ask; hashtags 5–12 without requiring # prefix.
- ALL user-facing text (hook, caption, hashtags, slide headline/body) MUST be in the requested content language.
Return ONLY valid JSON matching the schema.`;

export async function generateCarouselContent(params: {
  apiKey: string;
  niche: string;
  audience?: string;
  productSoftMention?: string;
  slideCount?: number;
  language: ContentLanguage;
  seriesHint?: string;
  model?: string;
  brandTone?: string;
  visualStyle?: string;
  dramaNotes?: string;
  carouselAestheticNotes?: string;
}): Promise<CarouselContent> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const model = params.model || "gpt-4.1-mini";
  const languageName = contentLanguageLabel(params.language);
  const slideCount = Math.min(8, Math.max(4, Math.round(params.slideCount ?? 5)));

  const userParts = [
    `Niche / topic:\n${params.niche}`,
    params.audience ? `Audience:\n${params.audience}` : null,
    params.productSoftMention
      ? `Soft product mention (use casually once mid-carousel, never as a hard sell):\n${params.productSoftMention}`
      : `No product to mention.`,
    params.seriesHint ? `Series hint:\n${params.seriesHint}` : null,
    params.brandTone ? `Brand / tone:\n${params.brandTone}` : null,
    params.visualStyle ? `Visual / production style:\n${params.visualStyle}` : null,
    params.dramaNotes ? `Dramaturgy / narrative notes:\n${params.dramaNotes}` : null,
    params.carouselAestheticNotes
      ? `Carousel image aesthetic (apply to every imagePrompt):\n${params.carouselAestheticNotes}`
      : null,
    `Exact slide count: ${slideCount} (including the hook slide).`,
    `Content language: ${languageName} (${params.language}).`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CAROUSEL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${userParts}

Respond with JSON keys: hook, caption, hashtags (string array), slides (array of { headline, body?, imagePrompt }). slides.length must be ${slideCount}.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty carousel content");

  const parsed = carouselContentSchema.parse(JSON.parse(raw));
  parsed.hashtags = parsed.hashtags.map((t) =>
    t.startsWith("#") ? t.slice(1) : t,
  );

  // Normalize length to requested count
  let slides = parsed.slides.slice(0, slideCount);
  while (slides.length < slideCount) {
    slides.push({
      headline: parsed.hook,
      body: "",
      imagePrompt:
        "Candid phone photo lifestyle scene matching the niche, natural light, no text",
    });
  }

  return {
    hook: parsed.hook,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    slides,
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
  dramaNotes?: string | null;
  visualArcNotes?: string | null;
  heygenNotes?: string | null;
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
    content.dramaNotes
      ? `Dramaturgy / narrative template:\n${content.dramaNotes}`
      : null,
    content.visualArcNotes
      ? `Visual arc / shot progression:\n${content.visualArcNotes}`
      : null,
    content.heygenNotes
      ? `Additional avatar / production notes:\n${content.heygenNotes}`
      : null,
    `End with a clear call to action: ${content.cta}`,
    `Include burned-in captions/subtitles suitable for silent autoplay.`,
    `Keep pacing energetic and retention-focused for Reels/TikTok.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const templateSuggestSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(""),
  brandTone: z.string().optional().default(""),
  visualStyle: z.string().optional().default(""),
  language: z.enum(["en", "ua"]).optional().default("ua"),
  dramaNotes: z.string().optional().default(""),
  visualArcNotes: z.string().optional().default(""),
  subtitleNotes: z.string().optional().default(""),
  sceneCount: z.number().int().min(3).max(8).optional().default(4),
  consistentCharacter: z.boolean().optional().default(true),
  subtitles: z.boolean().optional().default(true),
  slideCount: z.number().int().min(4).max(8).optional().default(5),
  heygenNotes: z.string().optional().default(""),
  carouselAestheticNotes: z.string().optional().default(""),
});

/** @deprecated Use templateSuggestSchema */
export const blueprintSuggestSchema = templateSuggestSchema;

export type TemplateSuggest = z.infer<typeof templateSuggestSchema>;
/** @deprecated Use TemplateSuggest */
export type BlueprintSuggest = TemplateSuggest;

const TEMPLATE_SYSTEM_PROMPT = `You design reusable short-form content templates for Reels/TikTok/Shorts (slideshow stills, avatar video, and photo carousels).
Given a video review / case study OR a short creative brief, extract directing DNA into structured fields.

Map typical review sections:
- Dramaturgy / hook pattern / POV shift / uniqueness → dramaNotes
- Visual arc / palette / character consistency / shot sizes → visualArcNotes + visualStyle (English, production-ready)
- Brand voice / tone of narration → brandTone
- Subtitles (karaoke, colors, placement) → subtitleNotes
- Scene/plan length and editing → sceneCount (3–8), consistentCharacter, subtitles on/off
- Carousel listicle length → slideCount (4–8)
- Avatar-specific notes → heygenNotes
- Image aesthetic for carousels → carouselAestheticNotes (English)

Prefer concrete, reusable instructions over summarizing the source. name should be short and memorable.
Return ONLY valid JSON matching the schema.`;

export async function generateTemplateFromInput(params: {
  apiKey: string;
  reviewText?: string;
  brief?: string;
  language?: ContentLanguage;
  model?: string;
}): Promise<TemplateSuggest> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const model = params.model || "gpt-4.1-mini";
  const language: ContentLanguage = params.language ?? "ua";
  const languageName = contentLanguageLabel(language);

  const source = (params.reviewText || params.brief || "").trim();
  if (!source) {
    throw new Error("reviewText or brief is required");
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.55,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TEMPLATE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Preferred template language hint for narrative notes: ${languageName} (${language}).
visualStyle, heygenNotes, and carouselAestheticNotes MUST be in English for production tools.
brandTone / dramaNotes / visualArcNotes / subtitleNotes / description may be in ${languageName}.

Source material:
${source}

Respond with JSON keys: name, description, brandTone, visualStyle, language ("en"|"ua"), dramaNotes, visualArcNotes, subtitleNotes, sceneCount, consistentCharacter, subtitles, slideCount, heygenNotes, carouselAestheticNotes.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty template");

  return templateSuggestSchema.parse(JSON.parse(raw));
}

/** @deprecated Use generateTemplateFromInput */
export const generateBlueprintFromInput = generateTemplateFromInput;

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
