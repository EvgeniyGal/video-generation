import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { postMetrics, scheduledPosts } from "@/server/db/schema";
import { getBufferAccountApiKey } from "@/server/integrations/credentials";
import { fetchPostMetrics } from "@/server/integrations/buffer";

export async function syncBufferMetrics() {
  const posts = await db.query.scheduledPosts.findMany({
    where: and(
      isNotNull(scheduledPosts.bufferPostId),
      ne(scheduledPosts.status, "failed"),
    ),
  });

  let synced = 0;
  let errors = 0;

  for (const post of posts) {
    if (!post.bufferPostId) continue;
    try {
      const apiKey = await getBufferAccountApiKey(post.bufferAccountId);
      if (!apiKey) {
        errors += 1;
        continue;
      }

      const result = await fetchPostMetrics(apiKey, post.bufferPostId);
      if (!result) continue;

      await db.insert(postMetrics).values({
        scheduledPostId: post.id,
        metrics: result.metrics ?? [],
        metricsUpdatedAt: result.metricsUpdatedAt
          ? new Date(result.metricsUpdatedAt)
          : null,
      });

      if (result.metrics?.length) {
        await db
          .update(scheduledPosts)
          .set({ status: "sent", updatedAt: new Date() })
          .where(eq(scheduledPosts.id, post.id));
      }

      synced += 1;
    } catch (err) {
      console.error("Metrics sync failed for post", post.id, err);
      errors += 1;
    }
  }

  return { synced, errors, total: posts.length };
}
