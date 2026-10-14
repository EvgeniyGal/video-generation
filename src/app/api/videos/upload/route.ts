import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { reelDrafts, videos } from "@/server/db/schema";
import {
  removeStoragePaths,
  uploadPublicVideo,
} from "@/server/integrations/storage";
import { derivePublishStatus } from "@/lib/publish-status";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function parseHashtags(raw: string): string[] {
  const parts = raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

function extensionFor(file: File): string {
  const name = file.name || "";
  const fromName = path.extname(name).toLowerCase();
  if (fromName === ".mp4" || fromName === ".mov" || fromName === ".webm") {
    return fromName;
  }
  if (file.type === "video/quicktime") return ".mov";
  if (file.type === "video/webm") return ".webm";
  return ".mp4";
}

function contentTypeFor(file: File, ext: string): string {
  if (file.type && ALLOWED_TYPES.has(file.type)) return file.type;
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "video/mp4";
}

function isAllowedVideo(file: File): boolean {
  if (file.type && ALLOWED_TYPES.has(file.type)) return true;
  const ext = path.extname(file.name || "").toLowerCase();
  return ext === ".mp4" || ext === ".mov" || ext === ".webm";
}

function tryProbeDuration(bytes: Buffer, ext: string): number | null {
  const tmp = path.join(os.tmpdir(), `vc-upload-${randomUUID()}${ext}`);
  try {
    fs.writeFileSync(tmp, bytes);
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        tmp,
      ],
      { encoding: "utf8" },
    );
    const n = parseFloat(out.trim());
    return n && !Number.isNaN(n) ? n : null;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      return jsonError("file is required");
    }
    if (!isAllowedVideo(file)) {
      return jsonError("Only MP4, MOV, or WebM videos are allowed", 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError("Video must be 100MB or smaller", 400);
    }

    const hook = String(form.get("hook") ?? form.get("title") ?? "").trim();
    const caption = String(form.get("caption") ?? "").trim();
    const hashtags = parseHashtags(String(form.get("hashtags") ?? ""));

    if (!hook) {
      return jsonError("title is required", 400);
    }

    const ext = extensionFor(file);
    const contentType = contentTypeFor(file, ext);
    const bytes = Buffer.from(await file.arrayBuffer());
    const duration = tryProbeDuration(bytes, ext);

    const [draft] = await db
      .insert(reelDrafts)
      .values({
        hook,
        script: "",
        caption,
        hashtags,
        cta: "",
        visualStyle: "custom upload",
        language: "en",
        status: "ready",
        suggestedDurationSec: duration ? Math.round(duration) : 30,
      })
      .returning();

    const videoId = randomUUID();
    const storagePath = `reels/${draft.id}/${videoId}${ext}`;

    let publicUrl: string;
    try {
      const uploaded = await uploadPublicVideo({
        path: storagePath,
        bytes,
        contentType,
      });
      publicUrl = uploaded.publicUrl;
    } catch (err) {
      await db.delete(reelDrafts).where(eq(reelDrafts.id, draft.id));
      throw err;
    }

    let video;
    try {
      [video] = await db
        .insert(videos)
        .values({
          id: videoId,
          reelDraftId: draft.id,
          provider: "custom",
          publicUrl,
          storagePath,
          duration,
          status: "ready",
        })
        .returning();
    } catch (err) {
      await removeStoragePaths([storagePath]);
      await db.delete(reelDrafts).where(eq(reelDrafts.id, draft.id));
      throw err;
    }

    return jsonOk({
      video: {
        ...video,
        draft,
        publishStatus: derivePublishStatus({
          draftStatus: draft.status,
          posts: [],
        }),
      },
    });
  });
}
