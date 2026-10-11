import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function withAuth<T>(
  fn: () => Promise<T>,
): Promise<NextResponse | T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(err);
    return jsonError(message, 500);
  }
}
