import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/server/db";
import {
  carouselDrafts,
  postMetrics,
  reelDrafts,
  scheduledPosts,
} from "@/server/db/schema";
import { getBufferAccountApiKey } from "@/server/integrations/credentials";
import { fetchPostMetrics } from "@/server/integrations/buffer";

function isBufferSent(result: {
  status?: string | null;
  sentAt?: string | null;
  metrics?: unknown[] | null;
}): boolean {
  if (result.status === "sent") return true;
  if (result.sentAt) return true;
  return Boolean(result.metrics?.length);
}

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

      if (isBufferSent(result)) {
        await db
          .update(scheduledPosts)
          .set({ status: "sent", updatedAt: new Date() })
          .where(eq(scheduledPosts.id, post.id));

        if (post.reelDraftId) {
          await db
            .update(reelDrafts)
            .set({ status: "posted", updatedAt: new Date() })
            .where(eq(reelDrafts.id, post.reelDraftId));
        }
        if (post.carouselDraftId) {
          await db
            .update(carouselDrafts)
            .set({ status: "posted", updatedAt: new Date() })
            .where(eq(carouselDrafts.id, post.carouselDraftId));
        }
      }

      synced += 1;
    } catch (err) {
      console.error("Metrics sync failed for post", post.id, err);
      errors += 1;
    }
  }

  return { synced, errors, total: posts.length };
}
