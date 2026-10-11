import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { reelDrafts, videos } from "@/server/db/schema";
import { getIntegrationKey } from "@/server/integrations/credentials";
import {
  getVideo,
  getVideoAgentSession,
} from "@/server/integrations/heygen";
import {
  downloadUrlToBuffer,
  uploadPublicVideo,
} from "@/server/integrations/storage";

export async function pollHeyGenJobs() {
  const apiKey = await getIntegrationKey("heygen");
  if (!apiKey) return { processed: 0, reason: "no_heygen_key" as const };

  const pending = await db.query.videos.findMany({
    where: inArray(videos.status, ["pending", "generating"]),
  });

  let processed = 0;

  for (const video of pending) {
    try {
      if (!video.heygenSessionId) continue;

      let videoId = video.heygenVideoId;
      if (!videoId) {
        const session = await getVideoAgentSession(apiKey, video.heygenSessionId);
        if (session.status === "failed") {
          await db
            .update(videos)
            .set({
              status: "failed",
              errorMessage: session.error || "HeyGen session failed",
              updatedAt: new Date(),
            })
            .where(eq(videos.id, video.id));
          await db
            .update(reelDrafts)
            .set({
              status: "failed",
              errorMessage: session.error || "HeyGen session failed",
              updatedAt: new Date(),
            })
            .where(eq(reelDrafts.id, video.reelDraftId));
          processed += 1;
          continue;
        }
        if (!session.video_id) {
          await db
            .update(videos)
            .set({ status: "generating", updatedAt: new Date() })
            .where(eq(videos.id, video.id));
          continue;
        }
        videoId = session.video_id;
        await db
          .update(videos)
          .set({
            heygenVideoId: videoId,
            status: "generating",
            updatedAt: new Date(),
          })
          .where(eq(videos.id, video.id));
      }

      const heygenVideo = await getVideo(apiKey, videoId);
      if (heygenVideo.status === "failed") {
        await db
          .update(videos)
          .set({
            status: "failed",
            errorMessage: heygenVideo.error || "HeyGen video failed",
            updatedAt: new Date(),
          })
          .where(eq(videos.id, video.id));
        await db
          .update(reelDrafts)
          .set({
            status: "failed",
            errorMessage: heygenVideo.error || "HeyGen video failed",
            updatedAt: new Date(),
          })
          .where(eq(reelDrafts.id, video.reelDraftId));
        processed += 1;
        continue;
      }

      if (heygenVideo.status !== "completed" || !heygenVideo.video_url) {
        continue;
      }

      await db
        .update(videos)
        .set({ status: "uploading", updatedAt: new Date() })
        .where(eq(videos.id, video.id));

      const sourceUrl =
        heygenVideo.captioned_video_url || heygenVideo.video_url;
      const bytes = await downloadUrlToBuffer(sourceUrl);
      const path = `reels/${video.reelDraftId}/${video.id}.mp4`;
      const uploaded = await uploadPublicVideo({ path, bytes });

      await db
        .update(videos)
        .set({
          status: "ready",
          publicUrl: uploaded.publicUrl,
          storagePath: uploaded.path,
          thumbnailUrl: heygenVideo.thumbnail_url ?? null,
          duration: heygenVideo.duration ?? null,
          updatedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(videos.id, video.id));

      await db
        .update(reelDrafts)
        .set({ status: "ready", errorMessage: null, updatedAt: new Date() })
        .where(eq(reelDrafts.id, video.reelDraftId));

      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown poll error";
      await db
        .update(videos)
        .set({
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, video.id));
    }
  }

  return { processed };
}
