import { desc } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  bufferAccounts,
  bufferChannels,
  postMetrics,
  scheduledPosts,
  videos,
} from "@/server/db/schema";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const posts = await db.query.scheduledPosts.findMany({
    orderBy: [desc(scheduledPosts.createdAt)],
  });
  const metrics = await db.query.postMetrics.findMany({
    orderBy: [desc(postMetrics.capturedAt)],
  });
  const channels = await db.query.bufferChannels.findMany();
  const accounts = await db.query.bufferAccounts.findMany();
  const allVideos = await db.query.videos.findMany();

  const rows = posts.map((post) => {
    const channel = channels.find((c) => c.id === post.bufferChannelId);
    const account = accounts.find((a) => a.id === post.bufferAccountId);
    const video = allVideos.find((v) => v.id === post.videoId);
    const history = metrics.filter((m) => m.scheduledPostId === post.id);
    const latest = history[0] ?? null;

    return {
      post,
      channel,
      accountLabel: account?.label ?? null,
      video,
      latestMetrics: latest,
      history,
    };
  });

  return jsonOk({ rows });
}
