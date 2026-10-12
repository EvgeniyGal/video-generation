import { requireSession } from "@/server/auth/session";
import { getIntegrationKey } from "@/server/integrations/credentials";
import { listChatModels, listImageModels } from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireSession();

    const apiKey = await getIntegrationKey("openai");
    if (!apiKey) {
      return jsonError("OpenAI API key not configured", 400);
    }

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");

    if (kind === "image") {
      const models = await listImageModels(apiKey);
      return jsonOk({ models });
    }

    const models = await listChatModels(apiKey);
    return jsonOk({ models });
  });
}
