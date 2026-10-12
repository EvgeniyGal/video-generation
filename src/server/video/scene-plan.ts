import OpenAI from "openai";
import { z } from "zod";
import {
  contentLanguageLabel,
  isContentLanguage,
  type ContentLanguage,
} from "@/server/integrations/openai";

const scenePlanSchema = z.object({
  characterBible: z.string(),
  scenes: z
    .array(
      z.object({
        imagePrompt: z.string(),
        approxWordShare: z.number().positive(),
      }),
    )
    .min(1)
    .max(12),
});

export type ScenePlan = z.infer<typeof scenePlanSchema>;

export async function planSlideshowScenes(params: {
  apiKey: string;
  model: string;
  script: string;
  hook: string;
  visualStyle: string;
  language: string;
  sceneCount: number;
  consistentCharacter: boolean;
}): Promise<ScenePlan> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const lang: ContentLanguage = isContentLanguage(params.language)
    ? params.language
    : "en";
  const languageName = contentLanguageLabel(lang);
  const sceneCount = Math.min(8, Math.max(3, Math.round(params.sceneCount)));

  const system = `You plan vertical 9:16 reel slideshow scenes for AI image generation.
Return ONLY valid JSON.
Each scene needs a detailed English imagePrompt (image models follow English best).
approxWordShare is a relative weight for how long that scene should stay on screen (will be normalized).
When consistentCharacter is true, invent one reusable characterBible (appearance: age presentation, hair, face, outfit, style) and weave those details into every imagePrompt.
When consistentCharacter is false, leave characterBible as empty string and allow different subjects per scene.
Scenes must visually support the spoken script narrative in order.`;

  const user = `Content language (spoken): ${languageName}
Scene count: ${sceneCount}
Consistent character: ${params.consistentCharacter ? "yes" : "no"}
Hook: ${params.hook}
Script:
${params.script}
Visual style notes:
${params.visualStyle || "Photorealistic emotional short-form reel stills"}

Respond with JSON:
{
  "characterBible": "...",
  "scenes": [
    { "imagePrompt": "...", "approxWordShare": 1 }
  ]
}
Exactly ${sceneCount} scenes. imagePrompt must request vertical portrait composition suitable for 1080x1920.`;

  const completion = await client.chat.completions.create({
    model: params.model,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Scene plan: empty OpenAI response");

  const parsed = scenePlanSchema.parse(JSON.parse(raw));
  const scenes = parsed.scenes.slice(0, sceneCount);
  while (scenes.length < sceneCount) {
    scenes.push({
      imagePrompt:
        scenes[scenes.length - 1]?.imagePrompt ||
        "Vertical portrait emotional scene, photorealistic",
      approxWordShare: 1,
    });
  }

  return {
    characterBible: params.consistentCharacter
      ? parsed.characterBible.trim()
      : "",
    scenes,
  };
}
