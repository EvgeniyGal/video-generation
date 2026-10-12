import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  bufferChannels,
  reelDrafts,
  scheduledPosts,
  videos,
} from "@/server/db/schema";
import { getBufferAccountApiKey } from "@/server/integrations/credentials";
import { createVideoPost } from "@/server/integrations/buffer";
import { defaultPostText } from "@/lib/publish-status";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

const MAX_BATCH = 50;

type BulkItem = {
  videoId: string;
  text?: string;
  dueAt: string;
};

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const posts = await db.query.scheduledPosts.findMany({
      orderBy: [desc(scheduledPosts.createdAt)],
    });
    return jsonOk({ posts });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    const body = await request.json();

    // Legacy single-post shape → normalize to items[]
    let channelRowId = String(body.channelId ?? "");
    let items: BulkItem[] = [];

    if (Array.isArray(body.items)) {
      items = body.items.map(
        (it: { videoId?: string; text?: string; dueAt?: string }) => ({
          videoId: String(it.videoId ?? ""),
          text: it.text !== undefined ? String(it.text) : undefined,
          dueAt: String(it.dueAt ?? ""),
        }),
      );
    } else if (body.videoId) {
      // Backward-compatible single create (always customScheduled when dueAt set)
      const mode =
        body.mode === "customScheduled" ? "customScheduled" : "addToQueue";
      const dueAt = body.dueAt ? String(body.dueAt) : undefined;
      const text = String(body.text ?? "").trim();
      if (!channelRowId || !text) {
        return jsonError("channelId and text are required");
      }
      if (mode === "customScheduled" && !dueAt) {
        return jsonError("dueAt is required for customScheduled");
      }
      if (mode !== "customScheduled") {
        // Keep legacy addToQueue path for any old callers
        return createLegacyQueuePost({
          videoId: String(body.videoId),
          channelRowId,
          text,
          thumbnailOffsetMs:
            body.thumbnailOffsetMs !== undefined
              ? Number(body.thumbnailOffsetMs)
              : undefined,
        });
      }
      items = [
        {
          videoId: String(body.videoId),
          text,
          dueAt: dueAt!,
        },
      ];
    }

    if (!channelRowId) return jsonError("channelId is required");
    if (!items.length) return jsonError("items[] required");
    if (items.length > MAX_BATCH) {
      return jsonError(`At most ${MAX_BATCH} videos per batch`, 400);
    }

    for (const it of items) {
      if (!it.videoId || !it.dueAt) {
        return jsonError("Each item needs videoId and dueAt");
      }
      const due = new Date(it.dueAt);
      if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
        return jsonError(`dueAt must be a future time (${it.videoId})`, 400);
      }
    }

    const channel = await db.query.bufferChannels.findFirst({
      where: eq(bufferChannels.id, channelRowId),
    });
    if (!channel) return jsonError("Channel not found", 404);

    const apiKey = await getBufferAccountApiKey(channel.bufferAccountId);
    if (!apiKey) return jsonError("Buffer account key missing", 400);

    const videoIds = items.map((i) => i.videoId);
    const videoRows = await db.query.videos.findMany({
      where: inArray(videos.id, videoIds),
    });
    const videoMap = new Map(videoRows.map((v) => [v.id, v]));

    const drafts = await db.query.reelDrafts.findMany({
      where: inArray(
        reelDrafts.id,
        videoRows.map((v) => v.reelDraftId),
      ),
    });
    const draftMap = new Map(drafts.map((d) => [d.id, d]));

    const existingActive = await db.query.scheduledPosts.findMany({
      where: and(
        inArray(scheduledPosts.videoId, videoIds),
        ne(scheduledPosts.status, "failed"),
      ),
    });
    const activeByVideo = new Set(existingActive.map((p) => p.videoId));

    const created = [];
    const errors: Array<{ videoId: string; error: string }> = [];

    for (const it of items) {
      try {
        const video = videoMap.get(it.videoId);
        if (!video || video.status !== "ready" || !video.publicUrl) {
          errors.push({
            videoId: it.videoId,
            error: "Video is not ready with a public URL",
          });
          continue;
        }
        if (activeByVideo.has(it.videoId)) {
          errors.push({
            videoId: it.videoId,
            error: "Video already has an active scheduled/sent post",
          });
          continue;
        }

        const draft = draftMap.get(video.reelDraftId) ?? null;
        const text = (it.text?.trim() || defaultPostText(draft)).trim();
        if (!text) {
          errors.push({ videoId: it.videoId, error: "Post text is empty" });
          continue;
        }

        const post = await createVideoPost({
          apiKey,
          channelId: channel.channelId,
          text,
          videoUrl: video.publicUrl,
          mode: "customScheduled",
          dueAt: it.dueAt,
        });

        const [scheduled] = await db
          .insert(scheduledPosts)
          .values({
            videoId: it.videoId,
            reelDraftId: video.reelDraftId,
            bufferAccountId: channel.bufferAccountId,
            bufferChannelId: channel.id,
            bufferPostId: post.id,
            text,
            mode: "customScheduled",
            dueAt: new Date(it.dueAt),
            status: "scheduled",
          })
          .returning();

        await db
          .update(reelDrafts)
          .set({ status: "scheduled", updatedAt: new Date() })
          .where(eq(reelDrafts.id, video.reelDraftId));

        activeByVideo.add(it.videoId);
        created.push(scheduled);
      } catch (err) {
        errors.push({
          videoId: it.videoId,
          error: err instanceof Error ? err.message : "Failed to schedule",
        });
      }
    }

    return jsonOk({
      posts: created,
      created: created.length,
      errors,
    });
  });
}

async function createLegacyQueuePost(params: {
  videoId: string;
  channelRowId: string;
  text: string;
  thumbnailOffsetMs?: number;
}) {
  const video = await db.query.videos.findFirst({
    where: eq(videos.id, params.videoId),
  });
  if (!video || video.status !== "ready" || !video.publicUrl) {
    return jsonError("Video is not ready with a public URL", 400);
  }

  const channel = await db.query.bufferChannels.findFirst({
    where: eq(bufferChannels.id, params.channelRowId),
  });
  if (!channel) return jsonError("Channel not found", 404);

  const apiKey = await getBufferAccountApiKey(channel.bufferAccountId);
  if (!apiKey) return jsonError("Buffer account key missing", 400);

  try {
    const post = await createVideoPost({
      apiKey,
      channelId: channel.channelId,
      text: params.text,
      videoUrl: video.publicUrl,
      mode: "addToQueue",
      thumbnailOffsetMs: params.thumbnailOffsetMs,
    });

    const [scheduled] = await db
      .insert(scheduledPosts)
      .values({
        videoId: params.videoId,
        reelDraftId: video.reelDraftId,
        bufferAccountId: channel.bufferAccountId,
        bufferChannelId: channel.id,
        bufferPostId: post.id,
        text: params.text,
        mode: "addToQueue",
        dueAt: post.dueAt ? new Date(post.dueAt) : null,
        status: "scheduled",
      })
      .returning();

    await db
      .update(reelDrafts)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(eq(reelDrafts.id, video.reelDraftId));

    return jsonOk({ post: scheduled, posts: [scheduled], created: 1, errors: [] });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create Buffer post",
      400,
    );
  }
}
