import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  getSetting,
  hasIntegrationKey,
  setIntegrationKey,
  setSetting,
} from "@/server/integrations/credentials";
import { apiHandler, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();

    const accounts = await db.query.bufferAccounts.findMany({
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    const channels = await db.query.bufferChannels.findMany();

    return jsonOk({
      openaiConfigured: await hasIntegrationKey("openai"),
      heygenConfigured: await hasIntegrationKey("heygen"),
      brandTone: await getSetting("brand_tone"),
      globalStyle: await getSetting("global_style"),
      openaiModel: await getSetting("openai_model", "gpt-4.1-mini"),
      bufferAccounts: accounts.map((a) => ({
        id: a.id,
        label: a.label,
        organizationId: a.organizationId,
        organizationName: a.organizationName,
        channelCount: channels.filter((c) => c.bufferAccountId === a.id).length,
        createdAt: a.createdAt,
      })),
    });
  });
}

export async function PUT(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();

    if (typeof body.openaiApiKey === "string" && body.openaiApiKey.trim()) {
      await setIntegrationKey("openai", body.openaiApiKey);
    }
    if (typeof body.heygenApiKey === "string" && body.heygenApiKey.trim()) {
      await setIntegrationKey("heygen", body.heygenApiKey);
    }
    if (typeof body.brandTone === "string") {
      await setSetting("brand_tone", body.brandTone);
    }
    if (typeof body.globalStyle === "string") {
      await setSetting("global_style", body.globalStyle);
    }
    if (typeof body.openaiModel === "string" && body.openaiModel.trim()) {
      await setSetting("openai_model", body.openaiModel.trim());
    }

    return jsonOk({ ok: true });
  });
}
