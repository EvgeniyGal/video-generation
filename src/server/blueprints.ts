import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  blueprints,
  type BlueprintDefaults,
} from "@/server/db/schema";

export async function resolveBlueprint(blueprintId?: string | null) {
  if (blueprintId) {
    const byId = await db.query.blueprints.findFirst({
      where: eq(blueprints.id, blueprintId),
    });
    if (byId) return byId;
  }
  return (
    (await db.query.blueprints.findFirst({
      where: eq(blueprints.isDefault, true),
    })) ?? null
  );
}

export async function clearDefaultBlueprints(exceptId?: string) {
  const rows = await db.query.blueprints.findMany({
    where: eq(blueprints.isDefault, true),
  });
  for (const row of rows) {
    if (exceptId && row.id === exceptId) continue;
    await db
      .update(blueprints)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(blueprints.id, row.id));
  }
}

export function normalizeBlueprintDefaults(
  raw: unknown,
): BlueprintDefaults {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sceneCount = Number(obj.sceneCount);
  const slideCount = Number(obj.slideCount);
  return {
    sceneCount: Number.isFinite(sceneCount)
      ? Math.min(8, Math.max(3, Math.round(sceneCount)))
      : 4,
    consistentCharacter: obj.consistentCharacter !== false,
    subtitles: obj.subtitles !== false,
    slideCount: Number.isFinite(slideCount)
      ? Math.min(8, Math.max(4, Math.round(slideCount)))
      : 5,
    heygenNotes:
      typeof obj.heygenNotes === "string" ? obj.heygenNotes : "",
    carouselAestheticNotes:
      typeof obj.carouselAestheticNotes === "string"
        ? obj.carouselAestheticNotes
        : "",
  };
}
