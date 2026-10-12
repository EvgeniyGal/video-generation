export type PublishStatus = "unposted" | "scheduled" | "posted";

export type PostStatusRow = { status: string };

/**
 * Derive publish state for a video from its scheduled posts and draft status.
 * - posted: any post is `sent`, or draft is `posted`
 * - scheduled: any post is `scheduled` and none `sent`
 * - unposted: no active (non-failed) posts
 */
export function derivePublishStatus(params: {
  draftStatus?: string | null;
  posts: PostStatusRow[];
}): PublishStatus {
  if (params.draftStatus === "posted") return "posted";

  const active = params.posts.filter((p) => p.status !== "failed");
  if (active.some((p) => p.status === "sent")) return "posted";
  if (active.some((p) => p.status === "scheduled")) return "scheduled";
  return "unposted";
}

export function defaultPostText(draft: {
  caption?: string | null;
  hashtags?: string[] | null;
} | null): string {
  if (!draft) return "";
  const tags = (draft.hashtags ?? []).map((h) => `#${h}`).join(" ");
  return `${draft.caption ?? ""}\n\n${tags}`.trim();
}
