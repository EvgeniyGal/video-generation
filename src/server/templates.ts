import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  templates,
  type TemplateDefaults,
} from "@/server/db/schema";

export async function resolveTemplate(templateId?: string | null) {
  if (templateId) {
    const [byId] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1);
    if (byId) return byId;
  }
  const [fallback] = await db
    .select()
    .from(templates)
    .where(eq(templates.isDefault, true))
    .limit(1);
  return fallback ?? null;
}

/** @deprecated Use resolveTemplate */
export const resolveBlueprint = resolveTemplate;

export async function clearDefaultTemplates(exceptId?: string) {
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.isDefault, true));
  for (const row of rows) {
    if (exceptId && row.id === exceptId) continue;
    await db
      .update(templates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(templates.id, row.id));
  }
}

/** @deprecated Use clearDefaultTemplates */
export const clearDefaultBlueprints = clearDefaultTemplates;

export function normalizeTemplateDefaults(raw: unknown): TemplateDefaults {
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

/** @deprecated Use normalizeTemplateDefaults */
export const normalizeBlueprintDefaults = normalizeTemplateDefaults;

export async function listTemplates() {
  return db
    .select()
    .from(templates)
    .orderBy(desc(templates.isDefault), desc(templates.updatedAt));
}

export async function getTemplateById(id: string) {
  const [row] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, id))
    .limit(1);
  return row ?? null;
}
