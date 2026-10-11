import { eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { encryptSecret } from "@/server/crypto/secrets";
import { db } from "@/server/db";
import { bufferAccounts, bufferChannels } from "@/server/db/schema";
import {
  fetchChannels,
  fetchOrganizations,
} from "@/server/integrations/buffer";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json();
  const label = String(body.label ?? "").trim();
  const apiKey = String(body.apiKey ?? "").trim();
  const organizationId = body.organizationId
    ? String(body.organizationId)
    : null;

  if (!label || !apiKey) {
    return jsonError("label and apiKey are required");
  }

  let orgs;
  try {
    orgs = await fetchOrganizations(apiKey);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to validate Buffer API key",
      400,
    );
  }

  if (!orgs.length) {
    return jsonError("No Buffer organizations found for this key");
  }

  const org =
    (organizationId && orgs.find((o) => o.id === organizationId)) || orgs[0];

  let channels;
  try {
    channels = await fetchChannels(apiKey, org.id);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to fetch Buffer channels",
      400,
    );
  }

  const [account] = await db
    .insert(bufferAccounts)
    .values({
      label,
      encryptedApiKey: encryptSecret(apiKey),
      organizationId: org.id,
      organizationName: org.name,
    })
    .returning();

  if (channels.length) {
    await db.insert(bufferChannels).values(
      channels.map((ch) => ({
        bufferAccountId: account.id,
        channelId: ch.id,
        name: ch.name,
        displayName: ch.displayName,
        service: ch.service,
        avatar: ch.avatar,
      })),
    );
  }

  return jsonOk({
    account: {
      id: account.id,
      label: account.label,
      organizationId: account.organizationId,
      organizationName: account.organizationName,
      channelCount: channels.length,
    },
    organizations: orgs,
    channels,
  });
}

export async function DELETE(request: Request) {
  try {
    await requireSession();
  } catch {
    return jsonError("Unauthorized", 401);
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("id is required");

  await db.delete(bufferAccounts).where(eq(bufferAccounts.id, id));
  return jsonOk({ ok: true });
}
