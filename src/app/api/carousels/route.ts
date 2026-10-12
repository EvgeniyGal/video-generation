import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  carouselDrafts,
  carousels,
  scheduledPosts,
} from "@/server/db/schema";
import { hasIntegrationKey } from "@/server/integrations/credentials";
import { enqueueCarouselJob } from "@/server/jobs/run-carousel";
import { assertFfmpegAvailable } from "@/server/video/ffmpeg-carousel";
import { derivePublishStatus } from "@/lib/publish-status";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const rows = await db.query.carousels.findMany({
      orderBy: [desc(carousels.createdAt)],
    });
    const drafts = await db.query.carouselDrafts.findMany();
    const posts = await db.query.scheduledPosts.findMany();

    const postsByCarousel = new Map<string, typeof posts>();
    for (const p of posts) {
      if (!p.carouselId) continue;
      const list = postsByCarousel.get(p.carouselId) ?? [];
      list.push(p);
      postsByCarousel.set(p.carouselId, list);
    }

    return jsonOk({
      carousels: rows.map((c) => {
        const draft =
          drafts.find((d) => d.id === c.carouselDraftId) ?? null;
        const cPosts = postsByCarousel.get(c.id) ?? [];
        return {
          ...c,
          draft,
          publishStatus: derivePublishStatus({
            draftStatus: draft?.status,
            posts: cPosts,
          }),
        };
      }),
    });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    if (!(await hasIntegrationKey("openai"))) {
      return jsonError("OpenAI API key not configured", 400);
    }

    try {
      assertFfmpegAvailable();
    } catch (err) {
      return jsonError(
        err instanceof Error ? err.message : "FFmpeg required",
        400,
      );
    }

    const body = await request.json();
    const draftIds: string[] = Array.isArray(body.draftIds)
      ? body.draftIds.map(String)
      : body.draftId
        ? [String(body.draftId)]
        : [];
    if (!draftIds.length) return jsonError("draftId or draftIds required");

    const created = [];
    const errors: Array<{ draftId: string; error: string }> = [];

    for (const draftId of draftIds) {
      try {
        const draft = await db.query.carouselDrafts.findFirst({
          where: eq(carouselDrafts.id, draftId),
        });
        if (!draft) {
          errors.push({ draftId, error: "Draft not found" });
          continue;
        }
        if (
          ["generating", "ready", "scheduled", "posted"].includes(draft.status)
        ) {
          errors.push({
            draftId,
            error: `Draft already in status ${draft.status}`,
          });
          continue;
        }
        if (!draft.slides?.length) {
          errors.push({ draftId, error: "Draft has no slides" });
          continue;
        }

        const [row] = await db
          .insert(carousels)
          .values({
            carouselDraftId: draftId,
            status: "pending",
            jobPayload: { step: "queued" },
          })
          .returning();

        await db
          .update(carouselDrafts)
          .set({
            status: "generating",
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(carouselDrafts.id, draftId));

        created.push(row);
        enqueueCarouselJob(row.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        await db
          .update(carouselDrafts)
          .set({
            status: "failed",
            errorMessage: message,
            updatedAt: new Date(),
          })
          .where(eq(carouselDrafts.id, draftId));
        errors.push({ draftId, error: message });
      }
    }

    return jsonOk({ carousels: created, created: created.length, errors });
  });
}

export async function DELETE(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map(String)
      : body.id
        ? [String(body.id)]
        : [];
    if (!ids.length) return jsonError("id or ids required");

    await db.delete(carousels).where(inArray(carousels.id, ids));
    return jsonOk({ deleted: ids.length });
  });
}
