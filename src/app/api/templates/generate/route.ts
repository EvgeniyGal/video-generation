import { requireSession } from "@/server/auth/session";
import {
  getIntegrationKey,
  getSetting,
  hasIntegrationKey,
} from "@/server/integrations/credentials";
import {
  generateTemplateFromInput,
  isContentLanguage,
  type ContentLanguage,
} from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    if (!(await hasIntegrationKey("openai"))) {
      return jsonError("OpenAI API key not configured", 400);
    }
    const apiKey = await getIntegrationKey("openai");
    if (!apiKey) return jsonError("OpenAI API key not configured", 400);

    const body = await request.json();
    const reviewText = String(body.reviewText ?? "").trim();
    const brief = String(body.brief ?? "").trim();
    if (!reviewText && !brief) {
      return jsonError("reviewText or brief is required");
    }

    const languageRaw = String(body.language ?? "ua").trim().toLowerCase();
    const language: ContentLanguage = isContentLanguage(languageRaw)
      ? languageRaw
      : "ua";
    const model = await getSetting("openai_model", "gpt-4.1-mini");

    const suggested = await generateTemplateFromInput({
      apiKey,
      reviewText: reviewText || undefined,
      brief: brief || undefined,
      language,
      model,
    });

    return jsonOk({
      suggested: {
        name: suggested.name,
        description: suggested.description ?? "",
        brandTone: suggested.brandTone ?? "",
        visualStyle: suggested.visualStyle ?? "",
        language: suggested.language ?? language,
        dramaNotes: suggested.dramaNotes ?? "",
        visualArcNotes: suggested.visualArcNotes ?? "",
        subtitleNotes: suggested.subtitleNotes ?? "",
        sourceReview: reviewText || brief,
        defaults: {
          sceneCount: suggested.sceneCount ?? 4,
          consistentCharacter: suggested.consistentCharacter !== false,
          subtitles: suggested.subtitles !== false,
          slideCount: suggested.slideCount ?? 5,
          heygenNotes: suggested.heygenNotes ?? "",
          carouselAestheticNotes: suggested.carouselAestheticNotes ?? "",
        },
        isDefault: false,
      },
    });
  });
}
