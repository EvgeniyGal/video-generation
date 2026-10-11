import { requireSession } from "@/server/auth/session";
import { pollHeyGenJobs } from "@/server/jobs/poll-heygen";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST() {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const result = await pollHeyGenJobs();
  return jsonOk(result);
}
