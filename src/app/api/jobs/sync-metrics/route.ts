import { requireSession } from "@/server/auth/session";
import { syncBufferMetrics } from "@/server/jobs/sync-buffer-metrics";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST() {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const result = await syncBufferMetrics();
  return jsonOk(result);
}
