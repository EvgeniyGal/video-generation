import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  getElevenLabsSubscription,
  summarizeElevenLabsCredits,
} from "@/server/integrations/elevenlabs";
import {
  getHeyGenCurrentUser,
  summarizeHeyGenCredits,
} from "@/server/integrations/heygen";
import {
  getIntegrationKey,
  hasIntegrationKey,
} from "@/server/integrations/credentials";
import { apiHandler, jsonOk } from "@/lib/api";

export type ServiceBalance = {
  id: "openai" | "heygen" | "elevenlabs" | "buffer";
  configured: boolean;
  ok: boolean;
  remainingLabel: string | null;
  detail?: string | null;
  error?: string | null;
};

export async function GET() {
  return apiHandler(async () => {
    await requireSession();

    const [allIdeas, drafts, allVideos, posts, bufferAccounts, bufferChannels] =
      await Promise.all([
        db.query.ideas.findMany(),
        db.query.reelDrafts.findMany(),
        db.query.videos.findMany(),
        db.query.scheduledPosts.findMany(),
        db.query.bufferAccounts.findMany(),
        db.query.bufferChannels.findMany(),
      ]);

    const countBy = (items: { status: string }[], status: string) =>
      items.filter((i) => i.status === status).length;

    const services = await loadServiceBalances({
      bufferAccounts: bufferAccounts.length,
      bufferChannels: bufferChannels.length,
    });

    return jsonOk({
      ideas: allIdeas.length,
      drafts: {
        total: drafts.length,
        draft: countBy(drafts, "draft"),
        approved: countBy(drafts, "approved"),
        generating: countBy(drafts, "generating"),
        ready: countBy(drafts, "ready"),
        scheduled: countBy(drafts, "scheduled"),
        posted: countBy(drafts, "posted"),
        failed: countBy(drafts, "failed"),
      },
      videos: {
        total: allVideos.length,
        generating: allVideos.filter((v) =>
          ["pending", "generating", "uploading"].includes(v.status),
        ).length,
        ready: countBy(allVideos, "ready"),
        failed: countBy(allVideos, "failed"),
      },
      posts: posts.length,
      services,
    });
  });
}

async function loadServiceBalances(buffer: {
  bufferAccounts: number;
  bufferChannels: number;
}): Promise<ServiceBalance[]> {
  const [openaiConfigured, heygenKey, elevenKey] = await Promise.all([
    hasIntegrationKey("openai"),
    getIntegrationKey("heygen"),
    getIntegrationKey("elevenlabs"),
  ]);

  const [heygen, elevenlabs] = await Promise.all([
    fetchHeyGenBalance(heygenKey),
    fetchElevenLabsBalance(elevenKey),
  ]);

  return [
    {
      id: "openai",
      configured: openaiConfigured,
      ok: openaiConfigured,
      remainingLabel: openaiConfigured ? "usage-based" : null,
      detail: null,
      error: null,
    },
    heygen,
    elevenlabs,
    {
      id: "buffer",
      configured: buffer.bufferAccounts > 0,
      ok: true,
      remainingLabel: `${buffer.bufferAccounts}`,
      detail: `${buffer.bufferChannels}`,
      error: null,
    },
  ];
}

async function fetchHeyGenBalance(
  apiKey: string | null,
): Promise<ServiceBalance> {
  if (!apiKey) {
    return {
      id: "heygen",
      configured: false,
      ok: false,
      remainingLabel: null,
      error: null,
    };
  }
  try {
    const user = await getHeyGenCurrentUser(apiKey);
    const summary = summarizeHeyGenCredits(user);
    return {
      id: "heygen",
      configured: true,
      ok: true,
      remainingLabel: summary.remainingLabel,
      detail: summary.detail ?? user.email ?? user.username ?? null,
    };
  } catch (err) {
    return {
      id: "heygen",
      configured: true,
      ok: false,
      remainingLabel: null,
      error: err instanceof Error ? err.message : "Failed to load",
    };
  }
}

async function fetchElevenLabsBalance(
  apiKey: string | null,
): Promise<ServiceBalance> {
  if (!apiKey) {
    return {
      id: "elevenlabs",
      configured: false,
      ok: false,
      remainingLabel: null,
      error: null,
    };
  }
  try {
    const sub = await getElevenLabsSubscription(apiKey);
    const summary = summarizeElevenLabsCredits(sub);
    return {
      id: "elevenlabs",
      configured: true,
      ok: true,
      remainingLabel: summary.remainingLabel,
      detail: summary.detail ?? null,
    };
  } catch (err) {
    return {
      id: "elevenlabs",
      configured: true,
      ok: false,
      remainingLabel: null,
      error: err instanceof Error ? err.message : "Failed to load",
    };
  }
}
