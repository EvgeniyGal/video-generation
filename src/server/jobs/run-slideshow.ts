import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { reelDrafts, videos, type SlideshowJobPayload } from "@/server/db/schema";
import {
  getIntegrationKey,
  getSetting,
} from "@/server/integrations/credentials";
import {
  synthesizeSpeech,
  transcribeWithWordTimestamps,
} from "@/server/integrations/elevenlabs";
import {
  editPortraitImageFromReference,
  generatePortraitImage,
} from "@/server/integrations/openai-images";
import { uploadPublicVideo } from "@/server/integrations/storage";
import { buildKaraokeAss } from "@/server/video/ass-subtitles";
import {
  assertFfmpegAvailable,
  composeSlideshowMp4,
} from "@/server/video/ffmpeg-slideshow";
import { planSlideshowScenes } from "@/server/video/scene-plan";

async function setStep(videoId: string, payload: SlideshowJobPayload, step: string) {
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

export async function runSlideshowJob(videoId: string) {
  const video = await db.query.videos.findFirst({
    where: eq(videos.id, videoId),
  });
  if (!video || video.provider !== "slideshow") return;

  const draft = await db.query.reelDrafts.findFirst({
    where: eq(reelDrafts.id, video.reelDraftId),
  });
  if (!draft) {
    throw new Error("Draft not found for slideshow job");
  }

  const payload: SlideshowJobPayload = {
    ...(video.jobPayload ?? {}),
  };
  const sceneCount = Math.min(8, Math.max(3, payload.sceneCount ?? 4));
  const consistentCharacter = payload.consistentCharacter !== false;
  const subtitles = payload.subtitles !== false;
  const voiceId = payload.elevenLabsVoiceId;
  if (!voiceId) throw new Error("ElevenLabs voice is required");

  const openaiKey = await getIntegrationKey("openai");
  const elevenKey = await getIntegrationKey("elevenlabs");
  if (!openaiKey) throw new Error("OpenAI API key not configured");
  if (!elevenKey) throw new Error("ElevenLabs API key not configured");

  assertFfmpegAvailable();

  const chatModel = await getSetting("openai_model", "gpt-4.1-mini");
  const imageModel = await getSetting(
    "openai_image_model",
    "gpt-image-2.5-flare",
  );

  await setStep(videoId, payload, "planning_scenes");
  const plan = await planSlideshowScenes({
    apiKey: openaiKey,
    model: chatModel,
    script: draft.script,
    hook: draft.hook,
    visualStyle: payload.visualStyle || draft.visualStyle,
    language: draft.language,
    sceneCount,
    consistentCharacter,
    dramaNotes: payload.dramaNotes,
    visualArcNotes: payload.visualArcNotes,
    subtitleNotes: payload.subtitleNotes,
  });

  await setStep(videoId, { ...payload, scenePlan: plan }, "generating_images");

  const imageBuffers: Buffer[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    const bible = plan.characterBible
      ? `Character (keep identical): ${plan.characterBible}. `
      : "";
    const basePrompt = `${bible}${scene.imagePrompt}. Vertical 9:16 portrait composition, photorealistic, high detail.`;

    if (i === 0 || !consistentCharacter || imageBuffers.length === 0) {
      const buf = await generatePortraitImage({
        apiKey: openaiKey,
        model: imageModel,
        prompt: basePrompt,
      });
      imageBuffers.push(buf);
    } else {
      const editPrompt = [
        "Using image 1 as the character reference, create a new vertical 9:16 scene.",
        "Preserve the exact same person: face, hair, body proportions, outfit, and art style.",
        "Change only the setting, pose, and action as described:",
        scene.imagePrompt,
        plan.characterBible ? `Character bible: ${plan.characterBible}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const buf = await editPortraitImageFromReference({
        apiKey: openaiKey,
        model: imageModel,
        prompt: editPrompt,
        referencePng: imageBuffers[0],
      });
      imageBuffers.push(buf);
    }
  }

  await setStep(videoId, { ...payload, scenePlan: plan }, "generating_audio");
  const narration = [draft.hook, draft.script].filter(Boolean).join(". ");
  const audioBuffer = await synthesizeSpeech({
    apiKey: elevenKey,
    voiceId,
    text: narration,
  });

  let assContent: string | null = null;
  if (subtitles) {
    await setStep(videoId, { ...payload, scenePlan: plan }, "word_timestamps");
    const stamped = await transcribeWithWordTimestamps({
      apiKey: elevenKey,
      audio: audioBuffer,
    });
    assContent = buildKaraokeAss(stamped.words);
  }

  await setStep(videoId, { ...payload, scenePlan: plan }, "composing_video");
  const composed = await composeSlideshowMp4({
    imageBuffers,
    audioBuffer,
    sceneDurationsSec: plan.scenes.map((s) => s.approxWordShare),
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
      jobPayload: { ...payload, scenePlan: plan, step: "done" },
      updatedAt: new Date(),
    })
    .where(eq(videos.id, videoId));

  await db
    .update(reelDrafts)
    .set({ status: "ready", errorMessage: null, updatedAt: new Date() })
    .where(eq(reelDrafts.id, draft.id));
}

export async function processPendingSlideshowJobs() {
  const pending = await db.query.videos.findMany({
    where: and(
      eq(videos.provider, "slideshow"),
      inArray(videos.status, ["pending", "generating"]),
    ),
  });

  let processed = 0;
  for (const video of pending) {
    // Skip if already mid-flight with a recent step other than starting
    // (simple single-worker: process all pending; generating with no lock is ok for solo operator)
    try {
      if (video.status === "generating" && video.jobPayload?.step === "done") {
        continue;
      }
      // Only pick up pending, or generating stuck without progress restart carefully:
      // Process only `pending` to avoid double-runs; mark pending→generating immediately inside job.
      if (video.status !== "pending") continue;

      await db
        .update(videos)
        .set({ status: "generating", updatedAt: new Date() })
        .where(eq(videos.id, video.id));

      await runSlideshowJob(video.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Slideshow failed";
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

/** Fire-and-forget immediate run after enqueue (custom server). */
export function enqueueSlideshowJob(videoId: string) {
  void (async () => {
    // Claim so the cron recovery loop does not double-run
    const claimed = await db
      .update(videos)
      .set({ status: "generating", updatedAt: new Date() })
      .where(and(eq(videos.id, videoId), eq(videos.status, "pending")))
      .returning();
    if (!claimed.length) return;
    await runSlideshowJob(videoId);
  })().catch(async (err) => {
    const message = err instanceof Error ? err.message : "Slideshow failed";
    console.error("[jobs] slideshow error", videoId, message);
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
      console.error("[jobs] slideshow failure update error", e);
    }
  });
}
