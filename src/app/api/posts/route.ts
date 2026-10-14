import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  bufferChannels,
  carouselDrafts,
  carousels,
  reelDrafts,
  scheduledPosts,
  videos,
} from "@/server/db/schema";
import { getBufferAccountApiKey } from "@/server/integrations/credentials";
import {
  createImagePost,
  createVideoPost,
} from "@/server/integrations/buffer";
import {
  channelSupportsCarousel,
  channelSupportsVideo,
  isYoutubeService,
  YOUTUBE_DEFAULT_CATEGORY_ID,
} from "@/lib/buffer-media-support";
import { defaultPostText } from "@/lib/publish-status";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

function youtubeTitleFromDraft(draft: {
  hook?: string | null;
  caption?: string | null;
} | null): string {
  const hook = draft?.hook?.trim();
  if (hook) return hook.slice(0, 100);
  const caption = draft?.caption?.trim();
  if (caption) return caption.slice(0, 100);
  return "Video";
}

const MAX_ITEMS = 50;
const MAX_CHANNELS = 15;
const MAX_POSTS = 150;

type BulkItem = {
  videoId?: string;
  carouselId?: string;
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

    let channelIds: string[] = [];
    if (Array.isArray(body.channelIds)) {
      channelIds = body.channelIds.map(String).filter(Boolean);
    } else if (body.channelId) {
      channelIds = [String(body.channelId)];
    }

    let items: BulkItem[] = [];

    if (Array.isArray(body.items)) {
      items = body.items.map(
        (it: {
          videoId?: string;
          carouselId?: string;
          text?: string;
          dueAt?: string;
        }) => ({
          videoId: it.videoId ? String(it.videoId) : undefined,
          carouselId: it.carouselId ? String(it.carouselId) : undefined,
          text: it.text !== undefined ? String(it.text) : undefined,
          dueAt: String(it.dueAt ?? ""),
        }),
      );
    } else if (body.videoId) {
      const mode =
        body.mode === "customScheduled" ? "customScheduled" : "addToQueue";
      const dueAt = body.dueAt ? String(body.dueAt) : undefined;
      const text = String(body.text ?? "").trim();
      if (!channelIds.length || !text) {
        return jsonError("channelId(s) and text are required");
      }
      if (mode === "customScheduled" && !dueAt) {
        return jsonError("dueAt is required for customScheduled");
      }
      if (mode !== "customScheduled") {
        return createLegacyQueuePost({
          videoId: String(body.videoId),
          channelRowId: channelIds[0],
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
    } else if (body.carouselId) {
      const dueAt = body.dueAt ? String(body.dueAt) : undefined;
      const text = String(body.text ?? "").trim();
      if (!channelIds.length || !text || !dueAt) {
        return jsonError("channelId(s), text, and dueAt are required");
      }
      items = [
        {
          carouselId: String(body.carouselId),
          text,
          dueAt,
        },
      ];
    }

    if (!channelIds.length) return jsonError("channelIds required");
    if (channelIds.length > MAX_CHANNELS) {
      return jsonError(`At most ${MAX_CHANNELS} channels per batch`, 400);
    }
    if (!items.length) return jsonError("items[] required");
    if (items.length > MAX_ITEMS) {
      return jsonError(`At most ${MAX_ITEMS} items per batch`, 400);
    }
    if (items.length * channelIds.length > MAX_POSTS) {
      return jsonError(
        `Batch too large (max ${MAX_POSTS} posts = items × channels)`,
        400,
      );
    }

    for (const it of items) {
      if ((!it.videoId && !it.carouselId) || !it.dueAt) {
        return jsonError("Each item needs videoId or carouselId, and dueAt");
      }
      if (it.videoId && it.carouselId) {
        return jsonError("Each item must have only one of videoId or carouselId");
      }
      const due = new Date(it.dueAt);
      if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
        return jsonError(
          `dueAt must be a future time (${it.videoId || it.carouselId})`,
          400,
        );
      }
    }

    const channelRows = await db.query.bufferChannels.findMany({
      where: inArray(bufferChannels.id, channelIds),
    });
    if (channelRows.length !== channelIds.length) {
      return jsonError("One or more channels not found", 404);
    }
    const channelMap = new Map(channelRows.map((c) => [c.id, c]));

    const apiKeyByAccount = new Map<string, string>();
    for (const ch of channelRows) {
      if (apiKeyByAccount.has(ch.bufferAccountId)) continue;
      const key = await getBufferAccountApiKey(ch.bufferAccountId);
      if (!key) {
        return jsonError(
          `Buffer account key missing for channel ${ch.displayName || ch.id}`,
          400,
        );
      }
      apiKeyByAccount.set(ch.bufferAccountId, key);
    }

    const videoIds = items.map((i) => i.videoId).filter(Boolean) as string[];
    const carouselIds = items
      .map((i) => i.carouselId)
      .filter(Boolean) as string[];

    const videoRows = videoIds.length
      ? await db.query.videos.findMany({ where: inArray(videos.id, videoIds) })
      : [];
    const videoMap = new Map(videoRows.map((v) => [v.id, v]));

    const carouselRows = carouselIds.length
      ? await db.query.carousels.findMany({
          where: inArray(carousels.id, carouselIds),
        })
      : [];
    const carouselMap = new Map(carouselRows.map((c) => [c.id, c]));

    const reelDraftRows = videoRows.length
      ? await db.query.reelDrafts.findMany({
          where: inArray(
            reelDrafts.id,
            videoRows.map((v) => v.reelDraftId),
          ),
        })
      : [];
    const reelDraftMap = new Map(reelDraftRows.map((d) => [d.id, d]));

    const carouselDraftRows = carouselRows.length
      ? await db.query.carouselDrafts.findMany({
          where: inArray(
            carouselDrafts.id,
            carouselRows.map((c) => c.carouselDraftId),
          ),
        })
      : [];
    const carouselDraftMap = new Map(carouselDraftRows.map((d) => [d.id, d]));

    const existingActive = await db.query.scheduledPosts.findMany({
      where: and(
        inArray(scheduledPosts.bufferChannelId, channelIds),
        ne(scheduledPosts.status, "failed"),
      ),
    });
    const activePair = new Set(
      existingActive.map((p) =>
        p.videoId
          ? `v:${p.videoId}:${p.bufferChannelId}`
          : `c:${p.carouselId}:${p.bufferChannelId}`,
      ),
    );

    const created = [];
    const errors: Array<{
      videoId?: string;
      carouselId?: string;
      channelId?: string;
      error: string;
    }> = [];

    for (const it of items) {
      if (it.carouselId) {
        const carousel = carouselMap.get(it.carouselId);
        if (
          !carousel ||
          carousel.status !== "ready" ||
          !carousel.slideUrls?.length
        ) {
          errors.push({
            carouselId: it.carouselId,
            error: "Carousel is not ready with slide URLs",
          });
          continue;
        }
        if (carousel.slideUrls.length > 10) {
          errors.push({
            carouselId: it.carouselId,
            error: "Carousel has more than 10 slides",
          });
          continue;
        }

        const draft = carouselDraftMap.get(carousel.carouselDraftId) ?? null;
        const text = (it.text?.trim() || defaultPostText(draft)).trim();
        if (!text) {
          errors.push({
            carouselId: it.carouselId,
            error: "Post text is empty",
          });
          continue;
        }

        let anySuccess = false;
        for (const channelRowId of channelIds) {
          const channel = channelMap.get(channelRowId);
          if (!channel) continue;
          const pairKey = `c:${it.carouselId}:${channel.id}`;
          if (activePair.has(pairKey)) {
            errors.push({
              carouselId: it.carouselId,
              channelId: channel.id,
              error: "Already scheduled on this channel",
            });
            continue;
          }
          const apiKey = apiKeyByAccount.get(channel.bufferAccountId);
          if (!apiKey) {
            errors.push({
              carouselId: it.carouselId,
              channelId: channel.id,
              error: "Buffer account key missing",
            });
            continue;
          }

          const slideCount = carousel.slideUrls.length;
          if (!channelSupportsCarousel(channel.service, slideCount)) {
            errors.push({
              carouselId: it.carouselId,
              channelId: channel.id,
              error: `Channel service "${channel.service || "unknown"}" does not support ${slideCount}-image carousels`,
            });
            continue;
          }

          try {
            const post = await createImagePost({
              apiKey,
              channelId: channel.channelId,
              text,
              imageUrls: carousel.slideUrls,
              mode: "customScheduled",
              dueAt: it.dueAt,
            });

            const [scheduled] = await db
              .insert(scheduledPosts)
              .values({
                carouselId: it.carouselId,
                carouselDraftId: carousel.carouselDraftId,
                bufferAccountId: channel.bufferAccountId,
                bufferChannelId: channel.id,
                bufferPostId: post.id,
                text,
                mode: "customScheduled",
                dueAt: new Date(it.dueAt),
                status: "scheduled",
              })
              .returning();

            activePair.add(pairKey);
            anySuccess = true;
            created.push(scheduled);
          } catch (err) {
            errors.push({
              carouselId: it.carouselId,
              channelId: channel.id,
              error: err instanceof Error ? err.message : "Failed to schedule",
            });
          }
        }

        if (anySuccess) {
          await db
            .update(carouselDrafts)
            .set({ status: "scheduled", updatedAt: new Date() })
            .where(eq(carouselDrafts.id, carousel.carouselDraftId));
        }
        continue;
      }

      // Video path
      const video = videoMap.get(it.videoId!);
      if (!video || video.status !== "ready" || !video.publicUrl) {
        errors.push({
          videoId: it.videoId,
          error: "Video is not ready with a public URL",
        });
        continue;
      }

      const draft = reelDraftMap.get(video.reelDraftId) ?? null;
      const text = (it.text?.trim() || defaultPostText(draft)).trim();
      if (!text) {
        errors.push({ videoId: it.videoId, error: "Post text is empty" });
        continue;
      }

      let anySuccess = false;

      for (const channelRowId of channelIds) {
        const channel = channelMap.get(channelRowId);
        if (!channel) continue;

        const pairKey = `v:${it.videoId}:${channel.id}`;
        if (activePair.has(pairKey)) {
          errors.push({
            videoId: it.videoId,
            channelId: channel.id,
            error: "Already scheduled on this channel",
          });
          continue;
        }

        const apiKey = apiKeyByAccount.get(channel.bufferAccountId);
        if (!apiKey) {
          errors.push({
            videoId: it.videoId,
            channelId: channel.id,
            error: "Buffer account key missing",
          });
          continue;
        }

        if (!channelSupportsVideo(channel.service)) {
          errors.push({
            videoId: it.videoId,
            channelId: channel.id,
            error: `Channel service "${channel.service || "unknown"}" does not support video posts`,
          });
          continue;
        }

        try {
          const post = await createVideoPost({
            apiKey,
            channelId: channel.channelId,
            text,
            videoUrl: video.publicUrl,
            mode: "customScheduled",
            dueAt: it.dueAt,
            youtube: isYoutubeService(channel.service)
              ? {
                  title: youtubeTitleFromDraft(draft),
                  categoryId: YOUTUBE_DEFAULT_CATEGORY_ID,
                }
              : undefined,
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

          activePair.add(pairKey);
          anySuccess = true;
          created.push(scheduled);
        } catch (err) {
          errors.push({
            videoId: it.videoId,
            channelId: channel.id,
            error: err instanceof Error ? err.message : "Failed to schedule",
          });
        }
      }

      if (anySuccess) {
        await db
          .update(reelDrafts)
          .set({ status: "scheduled", updatedAt: new Date() })
          .where(eq(reelDrafts.id, video.reelDraftId));
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

  if (!channelSupportsVideo(channel.service)) {
    return jsonError(
      `Channel service "${channel.service || "unknown"}" does not support video posts`,
      400,
    );
  }

  const draft = await db.query.reelDrafts.findFirst({
    where: eq(reelDrafts.id, video.reelDraftId),
  });

  try {
    const post = await createVideoPost({
      apiKey,
      channelId: channel.channelId,
      text: params.text,
      videoUrl: video.publicUrl,
      mode: "addToQueue",
      thumbnailOffsetMs: params.thumbnailOffsetMs,
      youtube: isYoutubeService(channel.service)
        ? {
            title: youtubeTitleFromDraft(draft ?? null),
            categoryId: YOUTUBE_DEFAULT_CATEGORY_ID,
          }
        : undefined,
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

    return jsonOk({
      post: scheduled,
      posts: [scheduled],
      created: 1,
      errors: [],
    });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create Buffer post",
      400,
    );
  }
}
