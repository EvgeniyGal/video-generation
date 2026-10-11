import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const accounts = await db.query.bufferAccounts.findMany({
    orderBy: (t, { asc }) => [asc(t.label)],
  });
  const channels = await db.query.bufferChannels.findMany({
    orderBy: (t, { asc }) => [asc(t.service), asc(t.displayName)],
  });

  return jsonOk({
    channels: channels.map((ch) => {
      const account = accounts.find((a) => a.id === ch.bufferAccountId);
      return {
        ...ch,
        accountLabel: account?.label ?? "Unknown",
      };
    }),
  });
}
