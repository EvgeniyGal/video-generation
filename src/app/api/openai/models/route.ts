import { requireSession } from "@/server/auth/session";
import { getIntegrationKey } from "@/server/integrations/credentials";
import { listChatModels } from "@/server/integrations/openai";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();

    const apiKey = await getIntegrationKey("openai");
    if (!apiKey) {
      return jsonError("OpenAI API key not configured", 400);
    }

    const models = await listChatModels(apiKey);
    return jsonOk({ models });
  });
}
