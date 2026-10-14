/**
 * Buffer platform media capability map.
 * Limits from: https://support.buffer.com/articles/attaching-images-videos-and-other-media-to-your-posts-eudySt0TnS
 * Service enum: https://developers.buffer.com/types/Service.html
 */

export type BufferMediaKind = "video" | "carousel";

type ServiceCaps = {
  supportsVideo: boolean;
  maxImages: number;
};

const SERVICE_CAPS: Record<string, ServiceCaps> = {
  facebook: { supportsVideo: true, maxImages: 10 },
  instagram: { supportsVideo: true, maxImages: 10 },
  tiktok: { supportsVideo: true, maxImages: 10 },
  bluesky: { supportsVideo: true, maxImages: 10 },
  twitter: { supportsVideo: true, maxImages: 4 },
  mastodon: { supportsVideo: true, maxImages: 4 },
  linkedin: { supportsVideo: true, maxImages: 20 },
  threads: { supportsVideo: true, maxImages: 20 },
  pinterest: { supportsVideo: true, maxImages: 1 },
  youtube: { supportsVideo: true, maxImages: 0 },
  googlebusiness: { supportsVideo: false, maxImages: 1 },
  // Not used for video/carousel posting in this app
  startpage: { supportsVideo: false, maxImages: 0 },
  substack: { supportsVideo: false, maxImages: 0 },
  whatsapp: { supportsVideo: false, maxImages: 0 },
};

/** People & Blogs — default YouTube category when Buffer requires one. */
export const YOUTUBE_DEFAULT_CATEGORY_ID = "22";

export function normalizeBufferService(
  service: string | null | undefined,
): string {
  return (service ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function capsFor(
  service: string | null | undefined,
): ServiceCaps | null {
  const key = normalizeBufferService(service);
  if (!key) return null;
  return SERVICE_CAPS[key] ?? null;
}

export function channelSupportsVideo(
  service: string | null | undefined,
): boolean {
  return capsFor(service)?.supportsVideo === true;
}

export function channelSupportsCarousel(
  service: string | null | undefined,
  imageCount: number,
): boolean {
  if (!Number.isFinite(imageCount) || imageCount < 1) return false;
  const caps = capsFor(service);
  if (!caps) return false;
  return caps.maxImages >= imageCount;
}

export function maxImagesForService(
  service: string | null | undefined,
): number {
  return capsFor(service)?.maxImages ?? 0;
}

export function filterChannelsForMedia<
  T extends { service?: string | null },
>(
  channels: T[],
  params: { kind: BufferMediaKind; imageCount?: number },
): T[] {
  if (params.kind === "video") {
    return channels.filter((ch) => channelSupportsVideo(ch.service));
  }
  // Carousel: require true multi-image when count omitted (default ≥2)
  const needed =
    typeof params.imageCount === "number" && params.imageCount >= 1
      ? params.imageCount
      : 2;
  return channels.filter((ch) =>
    channelSupportsCarousel(ch.service, needed),
  );
}

export function isYoutubeService(service: string | null | undefined): boolean {
  return normalizeBufferService(service) === "youtube";
}
