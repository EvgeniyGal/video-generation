import { requireSession } from "@/server/auth/session";
import { getIntegrationKey } from "@/server/integrations/credentials";
import { listVoices } from "@/server/integrations/heygen";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const apiKey = await getIntegrationKey("heygen");
  if (!apiKey) return jsonError("HeyGen API key not configured", 400);

  try {
    const voices = await listVoices(apiKey);
    return jsonOk({ voices });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to list voices",
      500,
    );
  }
}
