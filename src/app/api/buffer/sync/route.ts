import { and, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { bufferAccounts, bufferChannels } from "@/server/db/schema";
import { getBufferAccountApiKey } from "@/server/integrations/credentials";
import { fetchChannels, fetchOrganizations } from "@/server/integrations/buffer";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json();
  const accountId = String(body.accountId ?? "");
  if (!accountId) return jsonError("accountId is required");

  const account = await db.query.bufferAccounts.findFirst({
    where: eq(bufferAccounts.id, accountId),
  });
  if (!account) return jsonError("Account not found", 404);

  const apiKey = await getBufferAccountApiKey(accountId);
  if (!apiKey) return jsonError("Missing API key", 400);

  const orgs = await fetchOrganizations(apiKey);
  const orgId = account.organizationId || orgs[0]?.id;
  if (!orgId) return jsonError("No organization available");

  const org = orgs.find((o) => o.id === orgId) || orgs[0];
  const channels = await fetchChannels(apiKey, org.id);

  await db
    .update(bufferAccounts)
    .set({
      organizationId: org.id,
      organizationName: org.name,
      updatedAt: new Date(),
    })
    .where(eq(bufferAccounts.id, accountId));

  // Upsert by Buffer channelId — never delete local channels (cascade would wipe
  // scheduled posts + analytics metrics).
  const existing = await db.query.bufferChannels.findMany({
    where: eq(bufferChannels.bufferAccountId, accountId),
  });
  const byRemoteId = new Map(existing.map((c) => [c.channelId, c]));

  for (const ch of channels) {
    const local = byRemoteId.get(ch.id);
    if (local) {
      await db
        .update(bufferChannels)
        .set({
          name: ch.name,
          displayName: ch.displayName,
          service: ch.service,
          avatar: ch.avatar,
          syncedAt: new Date(),
        })
        .where(
          and(
            eq(bufferChannels.id, local.id),
            eq(bufferChannels.bufferAccountId, accountId),
          ),
        );
    } else {
      await db.insert(bufferChannels).values({
        bufferAccountId: accountId,
        channelId: ch.id,
        name: ch.name,
        displayName: ch.displayName,
        service: ch.service,
        avatar: ch.avatar,
      });
    }
  }

  const synced = await db.query.bufferChannels.findMany({
    where: eq(bufferChannels.bufferAccountId, accountId),
  });

  return jsonOk({ channels: synced, organization: org });
}
