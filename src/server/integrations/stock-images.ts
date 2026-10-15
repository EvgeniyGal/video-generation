import type { StockImageRef } from "@/server/db/schema";
import { getIntegrationKey } from "@/server/integrations/credentials";

export type StockOrientation = "all" | "horizontal" | "vertical";

type SearchParams = {
  query: string;
  perPage?: number;
  orientation?: StockOrientation;
  pixabayKey?: string | null;
  pexelsKey?: string | null;
};

function stockKey(provider: string, id: string | number) {
  return `${provider}:${id}`;
}

async function searchPixabay(params: {
  apiKey: string;
  query: string;
  perPage: number;
  orientation: StockOrientation;
}): Promise<StockImageRef[]> {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", params.apiKey);
  url.searchParams.set("q", params.query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(Math.min(200, Math.max(3, params.perPage))));
  url.searchParams.set("order", "popular");
  if (params.orientation === "vertical") {
    url.searchParams.set("orientation", "vertical");
  } else if (params.orientation === "horizontal") {
    url.searchParams.set("orientation", "horizontal");
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Pixabay search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    hits?: Array<{
      id: number;
      previewURL?: string;
      webformatURL?: string;
      largeImageURL?: string;
      fullHDURL?: string;
      imageURL?: string;
      imageWidth?: number;
      imageHeight?: number;
      user?: string;
      pageURL?: string;
    }>;
  };

  return (data.hits ?? []).map((hit) => ({
    provider: "pixabay" as const,
    id: String(hit.id),
    previewUrl: hit.previewURL || hit.webformatURL || hit.largeImageURL || "",
    downloadUrl:
      hit.fullHDURL ||
      hit.largeImageURL ||
      hit.webformatURL ||
      hit.imageURL ||
      hit.previewURL ||
      "",
    width: hit.imageWidth,
    height: hit.imageHeight,
    photographer: hit.user,
    pageUrl: hit.pageURL,
    sourceQuery: params.query,
  }));
}

async function searchPexels(params: {
  apiKey: string;
  query: string;
  perPage: number;
  orientation: StockOrientation;
}): Promise<StockImageRef[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", params.query);
  url.searchParams.set("per_page", String(Math.min(80, Math.max(1, params.perPage))));
  if (params.orientation === "vertical") {
    url.searchParams.set("orientation", "portrait");
  } else if (params.orientation === "horizontal") {
    url.searchParams.set("orientation", "landscape");
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: params.apiKey },
  });
  if (!res.ok) {
    throw new Error(`Pexels search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    photos?: Array<{
      id: number;
      width?: number;
      height?: number;
      url?: string;
      photographer?: string;
      src?: {
        tiny?: string;
        small?: string;
        medium?: string;
        large?: string;
        large2x?: string;
        original?: string;
      };
    }>;
  };

  return (data.photos ?? []).map((photo) => ({
    provider: "pexels" as const,
    id: String(photo.id),
    previewUrl:
      photo.src?.medium || photo.src?.small || photo.src?.tiny || photo.src?.large || "",
    downloadUrl:
      photo.src?.large2x ||
      photo.src?.original ||
      photo.src?.large ||
      photo.src?.medium ||
      "",
    width: photo.width,
    height: photo.height,
    photographer: photo.photographer,
    pageUrl: photo.url,
    sourceQuery: params.query,
  }));
}

function mergeTopN(
  lists: StockImageRef[][],
  perPage: number,
  query: string,
): StockImageRef[] {
  const seen = new Set<string>();
  const out: StockImageRef[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));

  // Round-robin so both providers contribute before capping
  for (let i = 0; i < maxLen && out.length < perPage; i++) {
    for (const list of lists) {
      if (out.length >= perPage) break;
      const item = list[i];
      if (!item?.downloadUrl || !item.previewUrl) continue;
      const key = stockKey(item.provider, item.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, sourceQuery: query });
    }
  }
  return out;
}

export async function searchStockImages(
  params: SearchParams,
): Promise<StockImageRef[]> {
  const query = params.query.trim();
  if (!query) return [];

  const perPage = Math.min(20, Math.max(1, params.perPage ?? 5));
  const orientation = params.orientation ?? "vertical";

  const pixabayKey =
    params.pixabayKey !== undefined
      ? params.pixabayKey
      : await getIntegrationKey("pixabay");
  const pexelsKey =
    params.pexelsKey !== undefined
      ? params.pexelsKey
      : await getIntegrationKey("pexels");

  if (!pixabayKey && !pexelsKey) {
    throw new Error("Configure Pixabay and/or Pexels API keys in Settings");
  }

  const results: StockImageRef[][] = [];
  const errors: string[] = [];

  if (pixabayKey) {
    try {
      results.push(
        await searchPixabay({
          apiKey: pixabayKey,
          query,
          perPage: Math.max(perPage, 5),
          orientation,
        }),
      );
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Pixabay failed");
    }
  }

  if (pexelsKey) {
    try {
      results.push(
        await searchPexels({
          apiKey: pexelsKey,
          query,
          perPage: Math.max(perPage, 5),
          orientation,
        }),
      );
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Pexels failed");
    }
  }

  const merged = mergeTopN(results, perPage, query);
  if (!merged.length && errors.length) {
    throw new Error(errors.join("; "));
  }
  return merged;
}

export async function searchStockImagesBatch(params: {
  queries: string[];
  perQuery?: number;
  orientation?: StockOrientation;
}): Promise<Array<{ query: string; images: StockImageRef[] }>> {
  const pixabayKey = await getIntegrationKey("pixabay");
  const pexelsKey = await getIntegrationKey("pexels");
  if (!pixabayKey && !pexelsKey) {
    throw new Error("Configure Pixabay and/or Pexels API keys in Settings");
  }

  const perQuery = Math.min(10, Math.max(1, params.perQuery ?? 5));
  const orientation = params.orientation ?? "vertical";
  const queries = params.queries.map((q) => q.trim()).filter(Boolean);

  return Promise.all(
    queries.map(async (query) => ({
      query,
      images: await searchStockImages({
        query,
        perPage: perQuery,
        orientation,
        pixabayKey,
        pexelsKey,
      }),
    })),
  );
}

export async function downloadStockImage(ref: StockImageRef): Promise<Buffer> {
  if (!ref.downloadUrl) {
    throw new Error("Stock image has no download URL");
  }
  const res = await fetch(ref.downloadUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download stock image ${ref.provider}:${ref.id} (${res.status})`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

export function stockImageIdentity(ref: StockImageRef): string {
  return stockKey(ref.provider, ref.id);
}

export function isStockImageRef(value: unknown): value is StockImageRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.provider === "pixabay" || v.provider === "pexels") &&
    typeof v.id === "string" &&
    typeof v.previewUrl === "string" &&
    typeof v.downloadUrl === "string"
  );
}
