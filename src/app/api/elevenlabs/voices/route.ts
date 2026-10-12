import { requireSession } from "@/server/auth/session";
import { getIntegrationKey } from "@/server/integrations/credentials";
import { listElevenLabsVoices } from "@/server/integrations/elevenlabs";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    await requireSession();

    const apiKey = await getIntegrationKey("elevenlabs");
    if (!apiKey) {
      return jsonError("ElevenLabs API key not configured", 400);
    }

    const voices = await listElevenLabsVoices(apiKey);
    return jsonOk({ voices });
  });
}
