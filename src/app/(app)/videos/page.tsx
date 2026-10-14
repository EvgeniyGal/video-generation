"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { useLocale } from "@/i18n/LocaleProvider";

type VideoRow = {
  id: string;
  status: string;
  provider?: string | null;
  publishStatus?: "unposted" | "scheduled" | "posted";
  publicUrl: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  heygenSessionId: string | null;
  errorMessage: string | null;
  createdAt: string;
  draft: {
    hook: string;
    caption: string;
  } | null;
};

function providerLabel(
  provider: string | null | undefined,
  t: ReturnType<typeof useLocale>["t"],
) {
  if (provider === "slideshow") return t.videos.providerSlideshow;
  if (provider === "custom") return t.videos.providerCustom;
  return t.videos.providerHeygen;
}

export default function VideosPage() {
  const { t, tf } = useLocale();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/videos");
    const data = await res.json();
    setVideos(data.videos ?? []);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  function resetUploadForm() {
    setFile(null);
    setHook("");
    setCaption("");
    setHashtags("");
  }

  async function pollNow() {
    setMessage(null);
    const res = await fetch("/api/jobs/poll-heygen", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Poll failed");
      return;
    }
    setMessage(tf(t.videos.processed, { count: data.processed ?? 0 }));
    await load();
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("hook", hook.trim());
      body.append("caption", caption.trim());
      body.append("hashtags", hashtags.trim());
      const res = await fetch("/api/videos/upload", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || t.videos.uploadFailed);
        return;
      }
      setMessage(t.videos.uploadSuccess);
      setShowUpload(false);
      resetUploadForm();
      await load();
    } catch {
      setMessage(t.videos.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t.videos.title}</h1>
          <p className="muted">{t.videos.subtitle}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" type="button" onClick={pollNow}>
            {t.videos.poll}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => setShowUpload(true)}
          >
            {t.videos.addCustom}
          </button>
        </div>
      </div>
      {message ? <div className="muted">{message}</div> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        {videos.map((video) => (
          <div key={video.id} className="card stack" style={{ gap: "0.75rem" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row" style={{ gap: 6 }}>
                <StatusBadge status={video.status} />
                {video.status === "ready" ? (
                  <StatusBadge
                    status={video.publishStatus ?? "unposted"}
                  />
                ) : null}
              </div>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                {providerLabel(video.provider, t)}
                {" · "}
                {video.duration ? `${Math.round(video.duration)}s` : "—"}
              </span>
            </div>
            {video.publicUrl ? (
              <video
                src={video.publicUrl}
                controls
                style={{ width: "100%", borderRadius: 8, background: "#000" }}
              />
            ) : video.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.thumbnailUrl}
                alt=""
                style={{ width: "100%", borderRadius: 8 }}
              />
            ) : (
              <div
                className="muted"
                style={{
                  aspectRatio: "9/16",
                  maxHeight: 220,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--bg)",
                  borderRadius: 8,
                }}
              >
                {t.videos.rendering}
              </div>
            )}
            <div>
              <strong>{video.draft?.hook || t.videos.untitled}</strong>
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                {video.draft?.caption?.slice(0, 120)}
              </div>
            </div>
            {video.errorMessage ? (
              <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                {video.errorMessage}
              </div>
            ) : null}
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {video.provider === "custom"
                ? `${t.videos.provider}: ${t.videos.providerCustom}`
                : video.provider === "slideshow"
                  ? `${t.videos.provider}: ${t.videos.providerSlideshow}`
                  : `${t.videos.session}: ${video.heygenSessionId || "—"}`}
            </div>
          </div>
        ))}
      </div>
      {!videos.length ? <p className="muted">{t.videos.empty}</p> : null}

      {showUpload ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => {
            if (!uploading) {
              setShowUpload(false);
              resetUploadForm();
            }
          }}
        >
          <form
            className="card stack"
            style={{ width: "min(520px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onUpload}
          >
            <h2 style={{ margin: 0 }}>{t.videos.uploadTitle}</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {t.videos.uploadHint}
            </p>
            <div>
              <label className="label">{t.videos.file}</label>
              <input
                className="input"
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                required
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="label">{t.videos.titleLabel}</label>
              <input
                className="input"
                required
                value={hook}
                disabled={uploading}
                onChange={(e) => setHook(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t.videos.captionLabel}</label>
              <textarea
                className="textarea"
                rows={4}
                value={caption}
                disabled={uploading}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t.videos.hashtagsLabel}</label>
              <input
                className="input"
                value={hashtags}
                disabled={uploading}
                placeholder={t.videos.hashtagsPlaceholder}
                onChange={(e) => setHashtags(e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={uploading}
                onClick={() => {
                  setShowUpload(false);
                  resetUploadForm();
                }}
              >
                {t.cancel}
              </button>
              <button className="btn" type="submit" disabled={uploading || !file}>
                {uploading ? t.videos.uploading : t.videos.uploadSubmit}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
