import { desc, eq } from "drizzle-orm";
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
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

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
  const videoId = String(body.videoId ?? "");
  const channelRowId = String(body.channelId ?? ""); // our DB uuid
  const mode =
    body.mode === "customScheduled" ? "customScheduled" : "addToQueue";
  const dueAt = body.dueAt ? String(body.dueAt) : undefined;
  const text = String(body.text ?? "").trim();
  const thumbnailOffsetMs =
    body.thumbnailOffsetMs !== undefined
      ? Number(body.thumbnailOffsetMs)
      : undefined;

  if (!videoId || !channelRowId || !text) {
    return jsonError("videoId, channelId, and text are required");
  }
  if (mode === "customScheduled" && !dueAt) {
    return jsonError("dueAt is required for customScheduled");
  }

  const video = await db.query.videos.findFirst({
    where: eq(videos.id, videoId),
  });
  if (!video || video.status !== "ready" || !video.publicUrl) {
    return jsonError("Video is not ready with a public URL", 400);
  }

  const channel = await db.query.bufferChannels.findFirst({
    where: eq(bufferChannels.id, channelRowId),
  });
  if (!channel) return jsonError("Channel not found", 404);

  const apiKey = await getBufferAccountApiKey(channel.bufferAccountId);
  if (!apiKey) return jsonError("Buffer account key missing", 400);

  try {
    const post = await createVideoPost({
      apiKey,
      channelId: channel.channelId,
      text,
      videoUrl: video.publicUrl,
      mode,
      dueAt,
      thumbnailOffsetMs,
    });

    const [scheduled] = await db
      .insert(scheduledPosts)
      .values({
        videoId,
        reelDraftId: video.reelDraftId,
        bufferAccountId: channel.bufferAccountId,
        bufferChannelId: channel.id,
        bufferPostId: post.id,
        text,
        mode,
        dueAt: dueAt ? new Date(dueAt) : post.dueAt ? new Date(post.dueAt) : null,
        status: "scheduled",
      })
      .returning();

    await db
      .update(reelDrafts)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(eq(reelDrafts.id, video.reelDraftId));

    return jsonOk({ post: scheduled });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create Buffer post",
      400,
    );
  }
  });
}
