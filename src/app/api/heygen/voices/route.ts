import { requireSession } from "@/server/auth/session";
import { getIntegrationKey } from "@/server/integrations/credentials";
import {
  listAvatarsGrouped,
  listVoicesGrouped,
} from "@/server/integrations/heygen";
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
    const [voices, avatars] = await Promise.all([
      listVoicesGrouped(apiKey),
      listAvatarsGrouped(apiKey),
    ]);

    // Backward-compatible flat list: own first, then general.
    const flatVoices = [...voices.own, ...voices.general];

    return jsonOk({
      voices: flatVoices,
      voicesGrouped: voices,
      avatarsGrouped: avatars,
    });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to list HeyGen assets",
      500,
    );
  }
}
