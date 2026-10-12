import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  carouselDrafts,
  carousels,
  type CarouselJobPayload,
  type CarouselSlide,
} from "@/server/db/schema";
import {
  getIntegrationKey,
  getSetting,
} from "@/server/integrations/credentials";
import { generatePortraitImage } from "@/server/integrations/openai-images";
import { uploadPublicImage } from "@/server/integrations/storage";
import {
  assertFfmpegAvailable,
  composeCarouselSlide,
} from "@/server/video/ffmpeg-carousel";

const MAX_CONCURRENT = 2;
let active = 0;
const waitQueue: Array<() => void> = [];

async function withConcurrencySlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    const next = waitQueue.shift();
    if (next) next();
  }
}

async function setStep(
  carouselId: string,
  payload: CarouselJobPayload,
  step: string,
) {
  await db
    .update(carousels)
    .set({
      jobPayload: { ...payload, step },
      status: "generating",
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(carousels.id, carouselId));
}

export async function runCarouselJob(carouselId: string) {
  return withConcurrencySlot(() => runCarouselJobInner(carouselId));
}

async function runCarouselJobInner(carouselId: string) {
  const row = await db.query.carousels.findFirst({
    where: eq(carousels.id, carouselId),
  });
  if (!row) return;

  const draft = await db.query.carouselDrafts.findFirst({
    where: eq(carouselDrafts.id, row.carouselDraftId),
  });
  if (!draft) throw new Error("Carousel draft not found");

  const slides = (draft.slides ?? []) as CarouselSlide[];
  if (!slides.length) throw new Error("Carousel has no slides");

  const openaiKey = await getIntegrationKey("openai");
  if (!openaiKey) throw new Error("OpenAI API key not configured");

  assertFfmpegAvailable();

  const imageModel = await getSetting(
    "openai_image_model",
    "gpt-image-2.5-flare",
  );

  const payload: CarouselJobPayload = { ...(row.jobPayload ?? {}) };
  await setStep(carouselId, payload, "generating_slides");

  const slideUrls: string[] = [];
  const storagePaths: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    await setStep(carouselId, payload, `slide_${i + 1}_of_${slides.length}`);

    const prompt = [
      slide.imagePrompt,
      "Vertical 4:5 phone-photo aesthetic, candid lifestyle, natural light, photorealistic.",
      "Absolutely no text, letters, logos, watermarks, or UI chrome in the image.",
    ].join(" ");

    const bg = await generatePortraitImage({
      apiKey: openaiKey,
      model: imageModel,
      prompt,
    });

    const headline = slide.headline || draft.hook;
    const composed = composeCarouselSlide({
      backgroundBytes: bg,
      headline,
      body: slide.body,
    });

    const storagePath = `carousels/${draft.id}/${carouselId}/slide-${i + 1}.jpg`;
    const uploaded = await uploadPublicImage({
      path: storagePath,
      bytes: composed,
      contentType: "image/jpeg",
    });
    slideUrls.push(uploaded.publicUrl);
    storagePaths.push(uploaded.path);
  }

  await db
    .update(carousels)
    .set({
      status: "ready",
      slideUrls,
      storagePaths,
      errorMessage: null,
      jobPayload: { ...payload, step: "done" },
      updatedAt: new Date(),
    })
    .where(eq(carousels.id, carouselId));

  await db
    .update(carouselDrafts)
    .set({ status: "ready", errorMessage: null, updatedAt: new Date() })
    .where(eq(carouselDrafts.id, draft.id));
}

export async function processPendingCarouselJobs() {
  const pending = await db.query.carousels.findMany({
    where: and(
      eq(carousels.status, "pending"),
    ),
  });

  let processed = 0;
  for (const row of pending) {
    try {
      const claimed = await db
        .update(carousels)
        .set({ status: "generating", updatedAt: new Date() })
        .where(and(eq(carousels.id, row.id), eq(carousels.status, "pending")))
        .returning();
      if (!claimed.length) continue;
      await runCarouselJob(row.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Carousel failed";
      await failCarousel(row.id, row.carouselDraftId, message);
      processed += 1;
    }
  }
  return { processed };
}

export function enqueueCarouselJob(carouselId: string) {
  void (async () => {
    const claimed = await db
      .update(carousels)
      .set({ status: "generating", updatedAt: new Date() })
      .where(and(eq(carousels.id, carouselId), eq(carousels.status, "pending")))
      .returning();
    if (!claimed.length) return;
    await runCarouselJob(carouselId);
  })().catch(async (err) => {
    const message = err instanceof Error ? err.message : "Carousel failed";
    console.error("[jobs] carousel error", carouselId, message);
    try {
      const row = await db.query.carousels.findFirst({
        where: eq(carousels.id, carouselId),
      });
      if (!row) return;
      await failCarousel(carouselId, row.carouselDraftId, message);
    } catch (e) {
      console.error("[jobs] carousel failure update error", e);
    }
  });
}

async function failCarousel(
  carouselId: string,
  draftId: string,
  message: string,
) {
  await db
    .update(carousels)
    .set({
      status: "failed",
      errorMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(carousels.id, carouselId));
  await db
    .update(carouselDrafts)
    .set({
      status: "failed",
      errorMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(carouselDrafts.id, draftId));
}
