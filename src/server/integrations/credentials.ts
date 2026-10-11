import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  appSettings,
  bufferAccounts,
  integrationCredentials,
} from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto/secrets";

export type IntegrationProvider = "openai" | "heygen";

export async function setIntegrationKey(
  provider: IntegrationProvider,
  apiKey: string,
) {
  const encryptedKey = encryptSecret(apiKey.trim());
  const existing = await db.query.integrationCredentials.findFirst({
    where: eq(integrationCredentials.provider, provider),
  });
  if (existing) {
    await db
      .update(integrationCredentials)
      .set({ encryptedKey, updatedAt: new Date() })
      .where(eq(integrationCredentials.id, existing.id));
  } else {
    await db.insert(integrationCredentials).values({ provider, encryptedKey });
  }
}

export async function getIntegrationKey(
  provider: IntegrationProvider,
): Promise<string | null> {
  const row = await db.query.integrationCredentials.findFirst({
    where: eq(integrationCredentials.provider, provider),
  });
  if (!row) return null;
  return decryptSecret(row.encryptedKey);
}

export async function hasIntegrationKey(provider: IntegrationProvider) {
  const row = await db.query.integrationCredentials.findFirst({
    where: eq(integrationCredentials.provider, provider),
  });
  return Boolean(row);
}

export async function getBufferAccountApiKey(accountId: string) {
  const account = await db.query.bufferAccounts.findFirst({
    where: eq(bufferAccounts.id, accountId),
  });
  if (!account) return null;
  return decryptSecret(account.encryptedApiKey);
}

export async function getSetting(key: string, fallback = "") {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  });
  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({ key, value });
  }
}
