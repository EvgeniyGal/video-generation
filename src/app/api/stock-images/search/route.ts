import { requireSession } from "@/server/auth/session";
import {
  searchStockImages,
  searchStockImagesBatch,
  type StockOrientation,
} from "@/server/integrations/stock-images";
import { apiHandler, jsonError, jsonOk } from "@/lib/api";

function parseOrientation(value: unknown): StockOrientation {
  if (value === "horizontal" || value === "all" || value === "vertical") {
    return value;
  }
  return "vertical";
}

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return jsonError("q required");

    const perPage = Math.min(
      20,
      Math.max(1, Number(searchParams.get("perPage")) || 5),
    );
    const orientation = parseOrientation(searchParams.get("orientation"));

    const images = await searchStockImages({
      query: q,
      perPage,
      orientation,
    });
    return jsonOk({ query: q, images });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireSession();
    const body = await request.json();

    const orientation = parseOrientation(body.orientation);
    const perQuery = Math.min(
      10,
      Math.max(1, Number(body.perQuery ?? body.perPage) || 5),
    );

    if (Array.isArray(body.queries)) {
      const queries = body.queries.map(String).map((q: string) => q.trim()).filter(Boolean);
      if (!queries.length) return jsonError("queries required");
      const results = await searchStockImagesBatch({
        queries,
        perQuery,
        orientation,
      });
      return jsonOk({ results });
    }

    const q = String(body.q ?? body.query ?? "").trim();
    if (!q) return jsonError("q or queries required");

    const images = await searchStockImages({
      query: q,
      perPage: perQuery,
      orientation,
    });
    return jsonOk({ query: q, images });
  });
}
