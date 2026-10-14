import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { carouselDrafts, type CarouselSlide } from "@/server/db/schema";
import {
  normalizeBlueprintDefaults,
  resolveBlueprint,
} from "@/server/blueprints";
import {
  getIntegrationKey,
  getSetting,
  hasIntegrationKey,
} from "@/server/integrations/credentials";
import {
  generateCarouselContent,
  isContentLanguage,
  type ContentLanguage,
} from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const drafts = await db.query.carouselDrafts.findMany({
      orderBy: [desc(carouselDrafts.createdAt)],
    });
    return jsonOk({ drafts });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    if (!(await hasIntegrationKey("openai"))) {
      return jsonError("OpenAI API key not configured", 400);
    }
    const apiKey = await getIntegrationKey("openai");
    if (!apiKey) return jsonError("OpenAI API key not configured", 400);

    const body = await request.json();
    const niche = String(body.niche ?? "").trim();
    if (!niche) return jsonError("niche is required");

    const audience = String(body.audience ?? "").trim();
    const productSoftMention = String(body.productSoftMention ?? "").trim();
    const seriesHint = String(body.seriesHint ?? "").trim();
    const blueprint = await resolveBlueprint(
      body.blueprintId ? String(body.blueprintId) : null,
    );
    const bpDefaults = normalizeBlueprintDefaults(blueprint?.defaults);
    const slideCount = Math.min(
      8,
      Math.max(
        4,
        Number(body.slideCount) || bpDefaults.slideCount || 5,
      ),
    );
    const count = Math.min(20, Math.max(1, Number(body.count) || 1));
    const language: ContentLanguage = isContentLanguage(String(body.language ?? ""))
      ? (body.language as ContentLanguage)
      : "en";
    const model = await getSetting("openai_model", "gpt-4.1-mini");

    const created = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < count; i++) {
      try {
        const content = await generateCarouselContent({
          apiKey,
          niche,
          audience: audience || undefined,
          productSoftMention: productSoftMention || undefined,
          seriesHint: seriesHint || undefined,
          slideCount,
          language,
          model,
          brandTone: blueprint?.brandTone || undefined,
          visualStyle: blueprint?.visualStyle || undefined,
          dramaNotes: blueprint?.dramaNotes || undefined,
          carouselAestheticNotes:
            bpDefaults.carouselAestheticNotes || undefined,
        });

        const slides: CarouselSlide[] = content.slides.map((s, idx) => ({
          index: idx,
          headline: s.headline,
          body: s.body ?? "",
          imagePrompt: s.imagePrompt,
        }));

        const [draft] = await db
          .insert(carouselDrafts)
          .values({
            hook: content.hook,
            caption: content.caption,
            hashtags: content.hashtags,
            language: content.language,
            niche,
            audience,
            productMention: productSoftMention,
            slides,
            status: "draft",
          })
          .returning();
        created.push(draft);
      } catch (err) {
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : "Generate failed",
        });
      }
    }

    return jsonOk({ drafts: created, created: created.length, errors });
  });
}

export async function PATCH(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return jsonError("id required");

    const existing = await db.query.carouselDrafts.findFirst({
      where: eq(carouselDrafts.id, id),
    });
    if (!existing) return jsonError("Not found", 404);

    const patch: Partial<typeof carouselDrafts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.hook === "string") patch.hook = body.hook;
    if (typeof body.caption === "string") patch.caption = body.caption;
    if (Array.isArray(body.hashtags)) {
      patch.hashtags = body.hashtags.map(String);
    }
    if (typeof body.niche === "string") patch.niche = body.niche;
    if (typeof body.audience === "string") patch.audience = body.audience;
    if (typeof body.productMention === "string") {
      patch.productMention = body.productMention;
    }
    if (Array.isArray(body.slides)) {
      patch.slides = body.slides.map(
        (
          s: {
            index?: number;
            headline?: string;
            body?: string;
            imagePrompt?: string;
          },
          idx: number,
        ) => ({
          index: typeof s.index === "number" ? s.index : idx,
          headline: String(s.headline ?? ""),
          body: String(s.body ?? ""),
          imagePrompt: String(s.imagePrompt ?? ""),
        }),
      );
    }
    if (typeof body.status === "string") {
      const allowed = ["draft", "approved", "failed"];
      if (allowed.includes(body.status)) patch.status = body.status;
    }

    const [updated] = await db
      .update(carouselDrafts)
      .set(patch)
      .where(eq(carouselDrafts.id, id))
      .returning();

    return jsonOk({ draft: updated });
  });
}

export async function DELETE(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map(String)
      : body.id
        ? [String(body.id)]
        : [];
    if (!ids.length) return jsonError("id or ids required");

    await db
      .delete(carouselDrafts)
      .where(inArray(carouselDrafts.id, ids));

    return jsonOk({ deleted: ids.length });
  });
}
