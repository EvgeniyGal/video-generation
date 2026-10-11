import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { apiHandler, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();

    const [allIdeas, drafts, allVideos, posts] = await Promise.all([
      db.query.ideas.findMany(),
      db.query.reelDrafts.findMany(),
      db.query.videos.findMany(),
      db.query.scheduledPosts.findMany(),
    ]);

    const countBy = (items: { status: string }[], status: string) =>
      items.filter((i) => i.status === status).length;

    return jsonOk({
      ideas: allIdeas.length,
      drafts: {
        total: drafts.length,
        draft: countBy(drafts, "draft"),
        approved: countBy(drafts, "approved"),
        generating: countBy(drafts, "generating"),
        ready: countBy(drafts, "ready"),
        scheduled: countBy(drafts, "scheduled"),
        posted: countBy(drafts, "posted"),
        failed: countBy(drafts, "failed"),
      },
      videos: {
        total: allVideos.length,
        generating: allVideos.filter((v) =>
          ["pending", "generating", "uploading"].includes(v.status),
        ).length,
        ready: countBy(allVideos, "ready"),
        failed: countBy(allVideos, "failed"),
      },
      posts: posts.length,
    });
  });
}
