import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { ideas } from "@/server/db/schema";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();
    const rows = await db.query.ideas.findMany({
      orderBy: [desc(ideas.createdAt)],
    });
    return jsonOk({ ideas: rows });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();

    const brandTone = String(body.brandTone ?? "").trim();
    const visualStyle = String(body.visualStyle ?? "").trim();

    if (Array.isArray(body.ideas)) {
      const texts = body.ideas
        .map((t: unknown) => String(t ?? "").trim())
        .filter(Boolean);
      if (!texts.length) return jsonError("No ideas provided");

      const inserted = await db
        .insert(ideas)
        .values(
          texts.map((content: string) => ({
            content,
            title: content.slice(0, 80),
            brandTone,
            visualStyle,
          })),
        )
        .returning();
      return jsonOk({ ideas: inserted });
    }

    const content = String(body.content ?? "").trim();
    if (!content) return jsonError("content is required");

    const [row] = await db
      .insert(ideas)
      .values({
        content,
        title: String(body.title ?? content.slice(0, 80)),
        brandTone,
        visualStyle,
      })
      .returning();

    return jsonOk({ idea: row });
  });
}

export async function DELETE(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map(String)
      : body.id
        ? [String(body.id)]
        : [];

    if (!ids.length) return jsonError("id or ids required");

    await db.delete(ideas).where(inArray(ideas.id, ids));
    return jsonOk({ ok: true });
  });
}

export async function PATCH(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return jsonError("id is required");

    const patch: {
      content?: string;
      title?: string;
      status?: string;
      brandTone?: string;
      visualStyle?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (body.content !== undefined) patch.content = String(body.content);
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.brandTone !== undefined) patch.brandTone = String(body.brandTone);
    if (body.visualStyle !== undefined)
      patch.visualStyle = String(body.visualStyle);

    const [row] = await db
      .update(ideas)
      .set(patch)
      .where(eq(ideas.id, id))
      .returning();

    return jsonOk({ idea: row });
  });
}
