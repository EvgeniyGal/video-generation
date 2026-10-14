import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { reelDrafts, scheduledPosts, videos } from "@/server/db/schema";
import {
  getIntegrationKey,
  hasIntegrationKey,
} from "@/server/integrations/credentials";
import {
  normalizeBlueprintDefaults,
  resolveBlueprint,
} from "@/server/blueprints";
import { createVideoAgentSession } from "@/server/integrations/heygen";
import { buildHeyGenPrompt } from "@/server/integrations/openai";
import { removeStoragePaths } from "@/server/integrations/storage";
import { enqueueSlideshowJob } from "@/server/jobs/run-slideshow";
import { assertFfmpegAvailable } from "@/server/video/ffmpeg-slideshow";
import { derivePublishStatus } from "@/lib/publish-status";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const rows = await db.query.videos.findMany({
      orderBy: [desc(videos.createdAt)],
    });
    const drafts = await db.query.reelDrafts.findMany();
    const posts = await db.query.scheduledPosts.findMany();

    const postsByVideo = new Map<string, typeof posts>();
    for (const p of posts) {
      if (!p.videoId) continue;
      const list = postsByVideo.get(p.videoId) ?? [];
      list.push(p);
      postsByVideo.set(p.videoId, list);
    }

    return jsonOk({
      videos: rows.map((v) => {
        const draft = drafts.find((d) => d.id === v.reelDraftId) ?? null;
        const videoPosts = postsByVideo.get(v.id) ?? [];
        return {
          ...v,
          draft,
          publishStatus: derivePublishStatus({
            draftStatus: draft?.status,
            posts: videoPosts,
          }),
        };
      }),
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

    const type =
      body.type === "slideshow" || body.type === "heygen"
        ? body.type
        : "heygen";

    const blueprint = await resolveBlueprint(
      body.blueprintId ? String(body.blueprintId) : null,
    );
    const bpDefaults = normalizeBlueprintDefaults(blueprint?.defaults);

    const created = [];
    const errors: Array<{ draftId: string; error: string }> = [];

    if (type === "heygen") {
      const apiKey = await getIntegrationKey("heygen");
      if (!apiKey) return jsonError("HeyGen API key not configured", 400);

      const voiceId =
        body.voiceId !== undefined
          ? body.voiceId
            ? String(body.voiceId)
            : null
          : undefined;
      const avatarId =
        body.avatarId !== undefined
          ? body.avatarId
            ? String(body.avatarId)
            : null
          : undefined;

      for (const draftId of draftIds) {
        try {
          const draft = await db.query.reelDrafts.findFirst({
            where: eq(reelDrafts.id, draftId),
          });
          if (!draft) {
            errors.push({ draftId, error: "Draft not found" });
            continue;
          }

          if (
            ["generating", "ready", "scheduled", "posted"].includes(draft.status)
          ) {
            errors.push({
              draftId,
              error: `Draft already in status ${draft.status}`,
            });
            continue;
          }

          const resolvedVoiceId =
            voiceId !== undefined ? voiceId : draft.voiceId;
          const resolvedAvatarId =
            avatarId !== undefined ? avatarId : draft.avatarId;

          if (voiceId !== undefined || avatarId !== undefined) {
            await db
              .update(reelDrafts)
              .set({
                ...(voiceId !== undefined ? { voiceId } : {}),
                ...(avatarId !== undefined ? { avatarId } : {}),
                updatedAt: new Date(),
              })
              .where(eq(reelDrafts.id, draftId));
          }

          const prompt = buildHeyGenPrompt({
            hook: draft.hook,
            script: draft.script,
            caption: draft.caption,
            hashtags: draft.hashtags ?? [],
            cta: draft.cta,
            visualStyle:
              blueprint?.visualStyle?.trim() || draft.visualStyle,
            suggestedDurationSec: draft.suggestedDurationSec ?? 30,
            language: draft.language,
            dramaNotes: blueprint?.dramaNotes,
            visualArcNotes: blueprint?.visualArcNotes,
            heygenNotes: bpDefaults.heygenNotes,
          });

          const session = await createVideoAgentSession(apiKey, {
            prompt,
            voiceId: resolvedVoiceId,
            avatarId: resolvedAvatarId,
            styleId: draft.styleId,
            orientation: "portrait",
          });

          const [video] = await db
            .insert(videos)
            .values({
              reelDraftId: draftId,
              provider: "heygen",
              heygenSessionId: session.session_id,
              heygenVideoId: session.video_id,
              status: session.video_id ? "generating" : "pending",
            })
            .returning();

          await db
            .update(reelDrafts)
            .set({
              status: "generating",
              updatedAt: new Date(),
              errorMessage: null,
            })
            .where(eq(reelDrafts.id, draftId));

          created.push(video);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed";
          await db
            .update(reelDrafts)
            .set({
              status: "failed",
              errorMessage: message,
              updatedAt: new Date(),
            })
            .where(eq(reelDrafts.id, draftId));
          errors.push({ draftId, error: message });
        }
      }

      return jsonOk({ videos: created, errors });
    }

    // Slideshow
    if (!(await hasIntegrationKey("openai"))) {
      return jsonError("OpenAI API key not configured", 400);
    }
    if (!(await hasIntegrationKey("elevenlabs"))) {
      return jsonError("ElevenLabs API key not configured", 400);
    }

    const elevenLabsVoiceId = body.elevenLabsVoiceId
      ? String(body.elevenLabsVoiceId)
      : null;
    if (!elevenLabsVoiceId) {
      return jsonError("elevenLabsVoiceId is required for slideshow", 400);
    }

    const sceneCount = Math.min(
      8,
      Math.max(
        3,
        Number(body.sceneCount) || bpDefaults.sceneCount || 4,
      ),
    );
    const consistentCharacter =
      body.consistentCharacter !== undefined
        ? body.consistentCharacter !== false
        : bpDefaults.consistentCharacter !== false;
    const subtitles =
      body.subtitles !== undefined
        ? body.subtitles !== false
        : bpDefaults.subtitles !== false;

    try {
      assertFfmpegAvailable();
    } catch (err) {
      return jsonError(
        err instanceof Error ? err.message : "FFmpeg required",
        400,
      );
    }

    for (const draftId of draftIds) {
      try {
        const draft = await db.query.reelDrafts.findFirst({
          where: eq(reelDrafts.id, draftId),
        });
        if (!draft) {
          errors.push({ draftId, error: "Draft not found" });
          continue;
        }

        if (
          ["generating", "ready", "scheduled", "posted"].includes(draft.status)
        ) {
          errors.push({
            draftId,
            error: `Draft already in status ${draft.status}`,
          });
          continue;
        }

        const [video] = await db
          .insert(videos)
          .values({
            reelDraftId: draftId,
            provider: "slideshow",
            status: "pending",
            jobPayload: {
              elevenLabsVoiceId,
              sceneCount,
              consistentCharacter,
              subtitles,
              step: "queued",
              blueprintId: blueprint?.id,
              visualStyle: blueprint?.visualStyle || undefined,
              dramaNotes: blueprint?.dramaNotes || undefined,
              visualArcNotes: blueprint?.visualArcNotes || undefined,
              subtitleNotes: blueprint?.subtitleNotes || undefined,
            },
          })
          .returning();

        await db
          .update(reelDrafts)
          .set({
            status: "generating",
            updatedAt: new Date(),
            errorMessage: null,
          })
          .where(eq(reelDrafts.id, draftId));

        created.push(video);
        enqueueSlideshowJob(video.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        await db
          .update(reelDrafts)
          .set({
            status: "failed",
            errorMessage: message,
            updatedAt: new Date(),
          })
          .where(eq(reelDrafts.id, draftId));
        errors.push({ draftId, error: message });
      }
    }

    return jsonOk({ videos: created, errors });
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

    const rows = await db
      .select({
        id: videos.id,
        storagePath: videos.storagePath,
        reelDraftId: videos.reelDraftId,
      })
      .from(videos)
      .where(inArray(videos.id, ids));

    if (!rows.length) return jsonError("No videos found", 404);

    const paths = rows
      .map((v) => v.storagePath)
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      try {
        await removeStoragePaths(paths);
      } catch {
        // Still delete DB rows if storage cleanup fails (e.g. already gone).
      }
    }

    const draftIds = [...new Set(rows.map((v) => v.reelDraftId))];
    const deletedIds = rows.map((v) => v.id);

    await db.delete(videos).where(inArray(videos.id, deletedIds));

    const remaining = await db
      .select({ reelDraftId: videos.reelDraftId })
      .from(videos)
      .where(inArray(videos.reelDraftId, draftIds));
    const stillHave = new Set(remaining.map((r) => r.reelDraftId));
    const orphanDraftIds = draftIds.filter((id) => !stillHave.has(id));
    if (orphanDraftIds.length) {
      await db
        .delete(reelDrafts)
        .where(inArray(reelDrafts.id, orphanDraftIds));
    }

    return jsonOk({
      ok: true,
      deleted: deletedIds.length,
      draftsDeleted: orphanDraftIds.length,
    });
  });
}
