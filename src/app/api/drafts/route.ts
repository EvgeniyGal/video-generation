import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { ideas, reelDrafts, videos } from "@/server/db/schema";
import {
  getIntegrationKey,
  getSetting,
} from "@/server/integrations/credentials";
import { generateReelContent } from "@/server/integrations/openai";
import { removeStoragePaths } from "@/server/integrations/storage";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

async function generateDraftsForIdeas(params: {
  apiKey: string;
  model: string;
  selectedIdeas: Array<{
    id: string;
    content: string;
    brandTone: string;
    visualStyle: string;
  }>;
  defaultBrandTone: string;
  defaultVisualStyle: string;
}) {
  const created = [];
  const errors: Array<{ ideaId: string; error: string }> = [];

  for (const idea of params.selectedIdeas) {
    try {
      const content = await generateReelContent({
        apiKey: params.apiKey,
        idea: idea.content,
        brandTone: idea.brandTone || params.defaultBrandTone,
        globalStyle: idea.visualStyle || params.defaultVisualStyle,
        model: params.model,
      });

      const [draft] = await db
        .insert(reelDrafts)
        .values({
          ideaId: idea.id,
          hook: content.hook,
          script: content.script,
          caption: content.caption,
          hashtags: content.hashtags,
          cta: content.cta,
          visualStyle: content.visualStyle,
          suggestedDurationSec: content.suggestedDurationSec,
          status: "draft",
        })
        .returning();

      await db
        .update(ideas)
        .set({ status: "prepared", updatedAt: new Date() })
        .where(eq(ideas.id, idea.id));

      created.push(draft);
    } catch (err) {
      errors.push({
        ideaId: idea.id,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  return { created, errors };
}

function parseIdeaLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const drafts = await db.query.reelDrafts.findMany({
      orderBy: [desc(reelDrafts.createdAt)],
    });
    return jsonOk({ drafts });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    const body = await request.json();
    const apiKey = await getIntegrationKey("openai");
    if (!apiKey) return jsonError("OpenAI API key not configured", 400);

    const defaultBrandTone = await getSetting("brand_tone");
    const defaultVisualStyle = await getSetting("global_style");
    const model = await getSetting("openai_model", "gpt-4.1-mini");

    // New flow: plain text with many ideas → create ideas + AI drafts in one step
    const fromText =
      typeof body.ideasText === "string"
        ? body.ideasText
        : Array.isArray(body.ideas)
          ? body.ideas.map(String).join("\n")
          : "";

    if (fromText.trim()) {
      const lines = parseIdeaLines(fromText);
      if (!lines.length) return jsonError("No ideas provided");

      const brandTone = String(body.brandTone ?? "").trim();
      const visualStyle = String(body.visualStyle ?? "").trim();

      const inserted = await db
        .insert(ideas)
        .values(
          lines.map((content) => ({
            content,
            title: content.slice(0, 80),
            brandTone,
            visualStyle,
          })),
        )
        .returning();

      const { created, errors } = await generateDraftsForIdeas({
        apiKey,
        model,
        selectedIdeas: inserted,
        defaultBrandTone,
        defaultVisualStyle,
      });

      return jsonOk({ drafts: created, errors, ideasCreated: inserted.length });
    }

    // Legacy: prepare drafts from existing idea IDs
    const ideaIds: string[] = Array.isArray(body.ideaIds)
      ? body.ideaIds.map(String)
      : [];

    if (!ideaIds.length) {
      return jsonError("ideasText or ideaIds required");
    }

    const selectedIdeas = await db.query.ideas.findMany({
      where: inArray(ideas.id, ideaIds),
    });

    const { created, errors } = await generateDraftsForIdeas({
      apiKey,
      model,
      selectedIdeas,
      defaultBrandTone,
      defaultVisualStyle,
    });

    return jsonOk({ drafts: created, errors });
  });
}

export async function PATCH(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return jsonError("id is required");

    const updates: Partial<typeof reelDrafts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.hook !== undefined) updates.hook = String(body.hook);
    if (body.script !== undefined) updates.script = String(body.script);
    if (body.caption !== undefined) updates.caption = String(body.caption);
    if (body.cta !== undefined) updates.cta = String(body.cta);
    if (body.visualStyle !== undefined)
      updates.visualStyle = String(body.visualStyle);
    if (body.status !== undefined) updates.status = String(body.status);
    if (body.voiceId !== undefined)
      updates.voiceId = body.voiceId ? String(body.voiceId) : null;
    if (body.avatarId !== undefined)
      updates.avatarId = body.avatarId ? String(body.avatarId) : null;
    if (body.styleId !== undefined)
      updates.styleId = body.styleId ? String(body.styleId) : null;
    if (Array.isArray(body.hashtags)) {
      updates.hashtags = body.hashtags.map(String);
    }
    if (body.suggestedDurationSec !== undefined) {
      updates.suggestedDurationSec = Number(body.suggestedDurationSec);
    }

    const [draft] = await db
      .update(reelDrafts)
      .set(updates)
      .where(eq(reelDrafts.id, id))
      .returning();

    return jsonOk({ draft });
  });
}

export async function DELETE(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map(String)
      : body.id
        ? [String(body.id)]
        : searchParams.get("id")
          ? [String(searchParams.get("id"))]
          : [];

    if (!ids.length) return jsonError("id or ids required");

    // Cascade in DB: draft → videos → scheduled posts → metrics.
    // Clean Supabase files first so storage does not orphan after row delete.
    const relatedVideos = await db
      .select({ storagePath: videos.storagePath })
      .from(videos)
      .where(inArray(videos.reelDraftId, ids));
    const paths = relatedVideos
      .map((v) => v.storagePath)
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      try {
        await removeStoragePaths(paths);
      } catch {
        // Still delete DB rows if storage cleanup fails (e.g. already gone).
      }
    }

    await db.delete(reelDrafts).where(inArray(reelDrafts.id, ids));
    return jsonOk({ ok: true, deleted: ids.length });
  });
}
