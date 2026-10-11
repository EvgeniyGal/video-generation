import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { reelDrafts, videos } from "@/server/db/schema";
import { getIntegrationKey } from "@/server/integrations/credentials";
import { createVideoAgentSession } from "@/server/integrations/heygen";
import { buildHeyGenPrompt } from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const rows = await db.query.videos.findMany({
      orderBy: [desc(videos.createdAt)],
    });
    const drafts = await db.query.reelDrafts.findMany();

    return jsonOk({
      videos: rows.map((v) => ({
        ...v,
        draft: drafts.find((d) => d.id === v.reelDraftId) ?? null,
      })),
    });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
  await requireSession();

  const body = await request.json();
  const draftIds: string[] = Array.isArray(body.draftIds)
    ? body.draftIds.map(String)
    : body.draftId
      ? [String(body.draftId)]
      : [];

  if (!draftIds.length) return jsonError("draftId or draftIds required");

  const apiKey = await getIntegrationKey("heygen");
  if (!apiKey) return jsonError("HeyGen API key not configured", 400);

  const created = [];
  const errors: Array<{ draftId: string; error: string }> = [];

  for (const draftId of draftIds) {
    try {
      const draft = await db.query.reelDrafts.findFirst({
        where: eq(reelDrafts.id, draftId),
      });
      if (!draft) {
        errors.push({ draftId, error: "Draft not found" });
        continue;
      }

      if (["generating", "ready", "scheduled", "posted"].includes(draft.status)) {
        errors.push({
          draftId,
          error: `Draft already in status ${draft.status}`,
        });
        continue;
      }

      const prompt = buildHeyGenPrompt({
        hook: draft.hook,
        script: draft.script,
        caption: draft.caption,
        hashtags: draft.hashtags ?? [],
        cta: draft.cta,
        visualStyle: draft.visualStyle,
        suggestedDurationSec: draft.suggestedDurationSec ?? 30,
      });

      const session = await createVideoAgentSession(apiKey, {
        prompt,
        voiceId: draft.voiceId,
        avatarId: draft.avatarId,
        styleId: draft.styleId,
        orientation: "portrait",
      });

      const [video] = await db
        .insert(videos)
        .values({
          reelDraftId: draftId,
          heygenSessionId: session.session_id,
          heygenVideoId: session.video_id,
          status: session.video_id ? "generating" : "pending",
        })
        .returning();

      await db
        .update(reelDrafts)
        .set({ status: "generating", updatedAt: new Date(), errorMessage: null })
        .where(eq(reelDrafts.id, draftId));

      created.push(video);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await db
        .update(reelDrafts)
        .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
        .where(eq(reelDrafts.id, draftId));
      errors.push({ draftId, error: message });
    }
  }

  return jsonOk({ videos: created, errors });
  });
}
