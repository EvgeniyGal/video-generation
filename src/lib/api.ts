import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getErrorMessage(err: unknown, fallback = "Unknown error") {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return `${err.message}: ${cause.message}`;
    }
    return err.message;
  }
  return fallback;
}

/** Wrap route handlers so failures always return JSON (never an empty body). */
export async function apiHandler(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }
    console.error(err);
    return jsonError(getErrorMessage(err), 500);
  }
}
