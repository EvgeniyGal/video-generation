import { desc } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  postMetrics,
  scheduledPosts,
} from "@/server/db/schema";
import { apiHandler, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();

    const posts = await db.query.scheduledPosts.findMany({
      orderBy: [desc(scheduledPosts.createdAt)],
    });
    const metrics = await db.query.postMetrics.findMany({
      orderBy: [desc(postMetrics.capturedAt)],
    });
    const channels = await db.query.bufferChannels.findMany();
    const accounts = await db.query.bufferAccounts.findMany();
    const allVideos = await db.query.videos.findMany();
    const allCarousels = await db.query.carousels.findMany();
    const allReelDrafts = await db.query.reelDrafts.findMany();
    const allCarouselDrafts = await db.query.carouselDrafts.findMany();

    const rows = posts.map((post) => {
      const channel = channels.find((c) => c.id === post.bufferChannelId);
      const account = accounts.find((a) => a.id === post.bufferAccountId);
      const video = allVideos.find((v) => v.id === post.videoId);
      const carousel = allCarousels.find((c) => c.id === post.carouselId);
      const reelDraft =
        allReelDrafts.find((d) => d.id === post.reelDraftId) ??
        (video
          ? allReelDrafts.find((d) => d.id === video.reelDraftId)
          : undefined);
      const carouselDraft =
        allCarouselDrafts.find((d) => d.id === post.carouselDraftId) ??
        (carousel
          ? allCarouselDrafts.find((d) => d.id === carousel.carouselDraftId)
          : undefined);
      const history = metrics.filter((m) => m.scheduledPostId === post.id);
      const latest = history[0] ?? null;

      const mediaKind = post.carouselId
        ? ("carousel" as const)
        : post.videoId
          ? ("video" as const)
          : ("unknown" as const);
      const title =
        carouselDraft?.hook?.trim() ||
        reelDraft?.hook?.trim() ||
        null;

      return {
        post,
        channel,
        accountLabel: account?.label ?? null,
        video,
        carousel,
        mediaKind,
        title,
        latestMetrics: latest,
        history,
      };
    });

    return jsonOk({ rows });
  });
}
