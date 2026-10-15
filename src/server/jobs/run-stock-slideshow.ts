import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  reelDrafts,
  videos,
  type SlideshowJobPayload,
  type StockSceneSelection,
} from "@/server/db/schema";
import { getIntegrationKey } from "@/server/integrations/credentials";
import {
  synthesizeSpeech,
  transcribeWithWordTimestamps,
} from "@/server/integrations/elevenlabs";
import { downloadStockImage } from "@/server/integrations/stock-images";
import { uploadPublicVideo } from "@/server/integrations/storage";
import { buildKaraokeAss } from "@/server/video/ass-subtitles";
import {
  assertFfmpegAvailable,
  composeSlideshowMp4,
} from "@/server/video/ffmpeg-slideshow";

async function setStep(
  videoId: string,
  payload: SlideshowJobPayload,
  step: string,
) {
  await db
    .update(videos)
    .set({
      jobPayload: { ...payload, step },
      status: "generating",
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(videos.id, videoId));
}

export async function runStockSlideshowJob(videoId: string) {
  const video = await db.query.videos.findFirst({
    where: eq(videos.id, videoId),
  });
  if (!video || video.provider !== "stock-slideshow") return;

  const draft = await db.query.reelDrafts.findFirst({
    where: eq(reelDrafts.id, video.reelDraftId),
  });
  if (!draft) {
    throw new Error("Draft not found for stock slideshow job");
  }

  const payload: SlideshowJobPayload = {
    ...(video.jobPayload ?? {}),
  };
  const stockScenes = (payload.stockScenes ?? []) as StockSceneSelection[];
  if (!stockScenes.length) {
    throw new Error("Stock slideshow requires selected scenes");
  }
  for (let i = 0; i < stockScenes.length; i++) {
    if (!stockScenes[i]?.selectedImage?.downloadUrl) {
      throw new Error(`Scene ${i + 1} has no selected stock image`);
    }
  }

  const subtitles = payload.subtitles !== false;
  const voiceId = payload.elevenLabsVoiceId;
  if (!voiceId) throw new Error("ElevenLabs voice is required");

  const elevenKey = await getIntegrationKey("elevenlabs");
  if (!elevenKey) throw new Error("ElevenLabs API key not configured");

  assertFfmpegAvailable();

  await setStep(videoId, payload, "downloading_images");
  const imageBuffers: Buffer[] = [];
  for (const scene of stockScenes) {
    imageBuffers.push(await downloadStockImage(scene.selectedImage));
  }

  await setStep(videoId, payload, "generating_audio");
  const narration = [draft.hook, draft.script].filter(Boolean).join(". ");
  const audioBuffer = await synthesizeSpeech({
    apiKey: elevenKey,
    voiceId,
    text: narration,
  });

  let assContent: string | null = null;
  if (subtitles) {
    await setStep(videoId, payload, "word_timestamps");
    const stamped = await transcribeWithWordTimestamps({
      apiKey: elevenKey,
      audio: audioBuffer,
    });
    assContent = buildKaraokeAss(stamped.words);
  }

  await setStep(videoId, payload, "composing_video");
  const composed = await composeSlideshowMp4({
    imageBuffers,
    audioBuffer,
    sceneDurationsSec: stockScenes.map((s) => s.approxWordShare),
    assContent,
  });

  await db
    .update(videos)
    .set({ status: "uploading", updatedAt: new Date() })
    .where(eq(videos.id, videoId));

  const storagePath = `reels/${draft.id}/${videoId}.mp4`;
  const uploaded = await uploadPublicVideo({
    path: storagePath,
    bytes: composed.mp4,
  });

  await db
    .update(videos)
    .set({
      status: "ready",
      publicUrl: uploaded.publicUrl,
      storagePath: uploaded.path,
      duration: composed.durationSec,
      errorMessage: null,
      jobPayload: { ...payload, step: "done" },
      updatedAt: new Date(),
    })
    .where(eq(videos.id, videoId));

  await db
    .update(reelDrafts)
    .set({ status: "ready", errorMessage: null, updatedAt: new Date() })
    .where(eq(reelDrafts.id, draft.id));
}

export async function processPendingStockSlideshowJobs() {
  const pending = await db.query.videos.findMany({
    where: and(
      eq(videos.provider, "stock-slideshow"),
      inArray(videos.status, ["pending", "generating"]),
    ),
  });

  let processed = 0;
  for (const video of pending) {
    try {
      if (video.status !== "pending") continue;

      await db
        .update(videos)
        .set({ status: "generating", updatedAt: new Date() })
        .where(eq(videos.id, video.id));

      await runStockSlideshowJob(video.id);
      processed += 1;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Stock slideshow failed";
      await db
        .update(videos)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, video.id));
      await db
        .update(reelDrafts)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(reelDrafts.id, video.reelDraftId));
      processed += 1;
    }
  }
  return { processed };
}

export function enqueueStockSlideshowJob(videoId: string) {
  void (async () => {
    const claimed = await db
      .update(videos)
      .set({ status: "generating", updatedAt: new Date() })
      .where(and(eq(videos.id, videoId), eq(videos.status, "pending")))
      .returning();
    if (!claimed.length) return;
    await runStockSlideshowJob(videoId);
  })().catch(async (err) => {
    const message =
      err instanceof Error ? err.message : "Stock slideshow failed";
    console.error("[jobs] stock-slideshow error", videoId, message);
    try {
      const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
      });
      if (!video) return;
      await db
        .update(videos)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId));
      await db
        .update(reelDrafts)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(reelDrafts.id, video.reelDraftId));
    } catch (e) {
      console.error("[jobs] stock-slideshow failure update error", e);
    }
  });
}
