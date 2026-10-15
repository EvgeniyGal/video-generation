import OpenAI from "openai";
import { z } from "zod";
import {
  contentLanguageLabel,
  isContentLanguage,
  type ContentLanguage,
} from "@/server/integrations/openai";

const QUERY_COUNT = 10;

const carouselPlanSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(12),
});

const slideshowPlanSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(12),
  scenes: z
    .array(
      z.object({
        label: z.string(),
        approxWordShare: z.number().positive(),
      }),
    )
    .min(1)
    .max(12),
});

export type StockCarouselQueryPlan = z.infer<typeof carouselPlanSchema>;
export type StockSlideshowQueryPlan = z.infer<typeof slideshowPlanSchema>;

function normalizeQueries(queries: string[], count = QUERY_COUNT): string[] {
  const cleaned = queries
    .map((q) => q.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const q of cleaned) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
    if (unique.length >= count) break;
  }
  while (unique.length < count && unique.length > 0) {
    unique.push(`${unique[unique.length % unique.length]} lifestyle`);
  }
  return unique.slice(0, count);
}

export async function planStockCarouselQueries(params: {
  apiKey: string;
  model: string;
  hook: string;
  niche?: string;
  audience?: string;
  productMention?: string;
  slides: Array<{ headline: string; body?: string; imagePrompt?: string }>;
  visualStyle?: string;
}): Promise<StockCarouselQueryPlan> {
  const client = new OpenAI({ apiKey: params.apiKey });

  const system = `You invent short English stock-photo SEARCH queries for Pixabay/Pexels.
Return ONLY valid JSON.
Queries must be concrete, searchable photo keywords (subjects, settings, mood) — NOT AI art prompts.
No quotes, no camera jargon, no "4K", no "no text". Prefer 3–8 words each.
Invent exactly ${QUERY_COUNT} diverse queries that cover the carousel narrative.`;

  const slideLines = params.slides
    .map(
      (s, i) =>
        `${i + 1}. ${s.headline}${s.body ? ` — ${s.body}` : ""}${
          s.imagePrompt ? ` (hint: ${s.imagePrompt})` : ""
        }`,
    )
    .join("\n");

  const user = `Hook: ${params.hook}
Niche: ${params.niche || "—"}
Audience: ${params.audience || "—"}
Product: ${params.productMention || "—"}
Visual notes: ${params.visualStyle || "candid lifestyle photography"}
Slides:
${slideLines}

Respond with JSON:
{ "queries": ["...", ...] }
Exactly ${QUERY_COUNT} queries.`;

  const completion = await client.chat.completions.create({
    model: params.model,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Stock carousel query plan: empty OpenAI response");

  const parsed = carouselPlanSchema.parse(JSON.parse(raw));
  return { queries: normalizeQueries(parsed.queries) };
}

export async function planStockSlideshowQueries(params: {
  apiKey: string;
  model: string;
  script: string;
  hook: string;
  visualStyle: string;
  language: string;
  sceneCount: number;
  dramaNotes?: string;
  visualArcNotes?: string;
}): Promise<StockSlideshowQueryPlan> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const lang: ContentLanguage = isContentLanguage(params.language)
    ? params.language
    : "en";
  const languageName = contentLanguageLabel(lang);
  const sceneCount = Math.min(8, Math.max(3, Math.round(params.sceneCount)));

  const system = `You plan stock-photo slideshows (Pixabay/Pexels) for vertical reels.
Return ONLY valid JSON.
Invent exactly ${QUERY_COUNT} short English stock SEARCH queries (concrete subjects/settings, not AI prompts).
Also invent exactly ${sceneCount} ordered scene slots with a short label (what that beat needs visually) and approxWordShare (relative on-screen weight; will be normalized).
Scenes must support the spoken script narrative in order. Queries should cover visual variety for the whole reel.`;

  const user = `Spoken language: ${languageName}
Scene count: ${sceneCount}
Hook: ${params.hook}
Script:
${params.script}
Visual style notes:
${params.visualStyle || "Photorealistic emotional short-form stills"}
${params.dramaNotes ? `Dramaturgy:\n${params.dramaNotes}` : ""}
${params.visualArcNotes ? `Visual arc:\n${params.visualArcNotes}` : ""}

Respond with JSON:
{
  "queries": ["...", ...],
  "scenes": [
    { "label": "...", "approxWordShare": 1 }
  ]
}
Exactly ${QUERY_COUNT} queries and exactly ${sceneCount} scenes.`;

  const completion = await client.chat.completions.create({
    model: params.model,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Stock slideshow query plan: empty OpenAI response");

  const parsed = slideshowPlanSchema.parse(JSON.parse(raw));
  const scenes = parsed.scenes.slice(0, sceneCount);
  while (scenes.length < sceneCount) {
    scenes.push({
      label: scenes[scenes.length - 1]?.label || "emotional portrait scene",
      approxWordShare: 1,
    });
  }

  return {
    queries: normalizeQueries(parsed.queries),
    scenes,
  };
}
