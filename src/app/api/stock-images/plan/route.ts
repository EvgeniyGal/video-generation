import { eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { carouselDrafts, reelDrafts } from "@/server/db/schema";
import {
  getIntegrationKey,
  getSetting,
  hasIntegrationKey,
} from "@/server/integrations/credentials";
import { searchStockImagesBatch } from "@/server/integrations/stock-images";
import {
  planStockCarouselQueries,
  planStockSlideshowQueries,
} from "@/server/video/stock-query-plan";
import {
  normalizeTemplateDefaults,
  resolveTemplate,
} from "@/server/templates";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    if (!(await hasIntegrationKey("openai"))) {
      return jsonError("OpenAI API key not configured", 400);
    }
    if (
      !(await hasIntegrationKey("pixabay")) &&
      !(await hasIntegrationKey("pexels"))
    ) {
      return jsonError("Configure Pixabay and/or Pexels API keys", 400);
    }

    const body = await request.json();
    const kind =
      body.kind === "carousel" || body.kind === "slideshow"
        ? body.kind
        : null;
    if (!kind) return jsonError('kind must be "carousel" or "slideshow"');

    const openaiKey = await getIntegrationKey("openai");
    if (!openaiKey) return jsonError("OpenAI API key not configured", 400);
    const chatModel = await getSetting("openai_model", "gpt-4.1-mini");
    const perQuery = Math.min(10, Math.max(1, Number(body.perQuery) || 5));

    if (kind === "carousel") {
      const draftId = String(body.draftId ?? "");
      if (!draftId) return jsonError("draftId required");

      const draft = await db.query.carouselDrafts.findFirst({
        where: eq(carouselDrafts.id, draftId),
      });
      if (!draft) return jsonError("Carousel draft not found", 404);

      const plan = await planStockCarouselQueries({
        apiKey: openaiKey,
        model: chatModel,
        hook: draft.hook,
        niche: draft.niche,
        audience: draft.audience,
        productMention: draft.productMention,
        slides: draft.slides ?? [],
      });

      const pool = await searchStockImagesBatch({
        queries: plan.queries,
        perQuery,
        orientation: "vertical",
      });

      await db
        .update(carouselDrafts)
        .set({
          stockQueryPool: pool,
          updatedAt: new Date(),
        })
        .where(eq(carouselDrafts.id, draftId));

      return jsonOk({
        kind: "carousel",
        draftId,
        queries: plan.queries,
        pool,
        slots: (draft.slides ?? []).map((s, i) => ({
          index: typeof s.index === "number" ? s.index : i,
          label: s.headline || `Slide ${i + 1}`,
          selectedImage: s.selectedImage ?? null,
        })),
      });
    }

    // slideshow
    const draftId = String(body.draftId ?? "");
    if (!draftId) return jsonError("draftId required");

    const draft = await db.query.reelDrafts.findFirst({
      where: eq(reelDrafts.id, draftId),
    });
    if (!draft) return jsonError("Draft not found", 404);

    const template = await resolveTemplate(
      body.templateId
        ? String(body.templateId)
        : body.blueprintId
          ? String(body.blueprintId)
          : null,
    );
    const templateDefaults = normalizeTemplateDefaults(template?.defaults);
    const sceneCount = Math.min(
      8,
      Math.max(
        3,
        Number(body.sceneCount) || templateDefaults.sceneCount || 4,
      ),
    );

    const plan = await planStockSlideshowQueries({
      apiKey: openaiKey,
      model: chatModel,
      script: draft.script,
      hook: draft.hook,
      visualStyle: template?.visualStyle || draft.visualStyle,
      language: draft.language,
      sceneCount,
      dramaNotes: template?.dramaNotes,
      visualArcNotes: template?.visualArcNotes,
    });

    const pool = await searchStockImagesBatch({
      queries: plan.queries,
      perQuery,
      orientation: "vertical",
    });

    return jsonOk({
      kind: "slideshow",
      draftId,
      queries: plan.queries,
      pool,
      scenes: plan.scenes.map((s, i) => ({
        index: i,
        label: s.label,
        approxWordShare: s.approxWordShare,
        selectedImage: null,
      })),
      templateId: template?.id ?? null,
      visualStyle: template?.visualStyle || draft.visualStyle,
      dramaNotes: template?.dramaNotes || "",
      visualArcNotes: template?.visualArcNotes || "",
      subtitleNotes: template?.subtitleNotes || "",
    });
  });
}
