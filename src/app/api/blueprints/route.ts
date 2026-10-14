import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { blueprints } from "@/server/db/schema";
import {
  clearDefaultBlueprints,
  normalizeBlueprintDefaults,
} from "@/server/blueprints";
import { isContentLanguage } from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

function parseBody(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const languageRaw = String(body.language ?? "ua").trim().toLowerCase();
  const language = isContentLanguage(languageRaw) ? languageRaw : "ua";
  return {
    name,
    description: String(body.description ?? "").trim(),
    brandTone: String(body.brandTone ?? "").trim(),
    visualStyle: String(body.visualStyle ?? "").trim(),
    language,
    defaults: normalizeBlueprintDefaults(body.defaults ?? body),
    dramaNotes: String(body.dramaNotes ?? "").trim(),
    visualArcNotes: String(body.visualArcNotes ?? "").trim(),
    subtitleNotes: String(body.subtitleNotes ?? "").trim(),
    sourceReview:
      body.sourceReview === null || body.sourceReview === undefined
        ? null
        : String(body.sourceReview).trim() || null,
    isDefault: body.isDefault === true,
  };
}

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const rows = await db.query.blueprints.findMany({
      orderBy: [desc(blueprints.isDefault), desc(blueprints.updatedAt)],
    });
    return jsonOk({ blueprints: rows });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const parsed = parseBody(body);
    if (!parsed.name) return jsonError("name is required");

    if (parsed.isDefault) {
      await clearDefaultBlueprints();
    }

    const [row] = await db
      .insert(blueprints)
      .values({
        name: parsed.name,
        description: parsed.description,
        brandTone: parsed.brandTone,
        visualStyle: parsed.visualStyle,
        language: parsed.language,
        defaults: parsed.defaults,
        dramaNotes: parsed.dramaNotes,
        visualArcNotes: parsed.visualArcNotes,
        subtitleNotes: parsed.subtitleNotes,
        sourceReview: parsed.sourceReview,
        isDefault: parsed.isDefault,
      })
      .returning();

    return jsonOk({ blueprint: row });
  });
}

export async function PATCH(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return jsonError("id is required");

    const existing = await db.query.blueprints.findFirst({
      where: eq(blueprints.id, id),
    });
    if (!existing) return jsonError("Blueprint not found", 404);

    const merged = {
      name: body.name !== undefined ? body.name : existing.name,
      description:
        body.description !== undefined ? body.description : existing.description,
      brandTone:
        body.brandTone !== undefined ? body.brandTone : existing.brandTone,
      visualStyle:
        body.visualStyle !== undefined ? body.visualStyle : existing.visualStyle,
      language: body.language !== undefined ? body.language : existing.language,
      defaults: body.defaults !== undefined ? body.defaults : existing.defaults,
      dramaNotes:
        body.dramaNotes !== undefined ? body.dramaNotes : existing.dramaNotes,
      visualArcNotes:
        body.visualArcNotes !== undefined
          ? body.visualArcNotes
          : existing.visualArcNotes,
      subtitleNotes:
        body.subtitleNotes !== undefined
          ? body.subtitleNotes
          : existing.subtitleNotes,
      sourceReview:
        body.sourceReview !== undefined
          ? body.sourceReview
          : existing.sourceReview,
      isDefault:
        body.isDefault !== undefined ? body.isDefault : existing.isDefault,
    };
    const parsed = parseBody(merged);
    if (!parsed.name) return jsonError("name is required");

    if (parsed.isDefault) {
      await clearDefaultBlueprints(id);
    }

    const [row] = await db
      .update(blueprints)
      .set({
        name: parsed.name,
        description: parsed.description,
        brandTone: parsed.brandTone,
        visualStyle: parsed.visualStyle,
        language: parsed.language,
        defaults: parsed.defaults,
        dramaNotes: parsed.dramaNotes,
        visualArcNotes: parsed.visualArcNotes,
        subtitleNotes: parsed.subtitleNotes,
        sourceReview: parsed.sourceReview,
        isDefault: parsed.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(blueprints.id, id))
      .returning();

    return jsonOk({ blueprint: row });
  });
}

export async function DELETE(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? searchParams.get("id") ?? "").trim();
    if (!id) return jsonError("id is required");

    await db.delete(blueprints).where(eq(blueprints.id, id));
    return jsonOk({ ok: true });
  });
}
