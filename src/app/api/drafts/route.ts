import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { ideas, reelDrafts } from "@/server/db/schema";
import {
  getIntegrationKey,
  getSetting,
} from "@/server/integrations/credentials";
import { generateReelContent } from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

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
  const ideaIds: string[] = Array.isArray(body.ideaIds)
    ? body.ideaIds.map(String)
    : [];

  if (!ideaIds.length) return jsonError("ideaIds required");

  const apiKey = await getIntegrationKey("openai");
  if (!apiKey) return jsonError("OpenAI API key not configured", 400);

  const defaultBrandTone = await getSetting("brand_tone");
  const defaultVisualStyle = await getSetting("global_style");
  const model = await getSetting("openai_model", "gpt-4.1-mini");

  const selectedIdeas = await db.query.ideas.findMany({
    where: inArray(ideas.id, ideaIds),
  });

  const created = [];
  const errors: Array<{ ideaId: string; error: string }> = [];

  for (const idea of selectedIdeas) {
    try {
      const content = await generateReelContent({
        apiKey,
        idea: idea.content,
        brandTone: idea.brandTone || defaultBrandTone,
        globalStyle: idea.visualStyle || defaultVisualStyle,
        model,
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
    if (body.visualStyle !== undefined) updates.visualStyle = String(body.visualStyle);
    if (body.status !== undefined) updates.status = String(body.status);
    if (body.voiceId !== undefined) updates.voiceId = body.voiceId ? String(body.voiceId) : null;
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
    const id = searchParams.get("id");
    if (!id) return jsonError("id required");

    await db.delete(reelDrafts).where(eq(reelDrafts.id, id));
    return jsonOk({ ok: true });
  });
}
