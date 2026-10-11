"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

type VideoRow = {
  id: string;
  status: string;
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

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/videos");
    const data = await res.json();
    setVideos(data.videos ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function pollNow() {
    setMessage(null);
    const res = await fetch("/api/jobs/poll-heygen", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Poll failed");
      return;
    }
    setMessage(`Processed ${data.processed ?? 0}`);
    await load();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Videos</h1>
          <p className="muted">HeyGen renders re-hosted to public Supabase Storage.</p>
        </div>
        <button className="btn btn-secondary" onClick={pollNow}>
          Poll HeyGen now
        </button>
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
              <StatusBadge status={video.status} />
              <span className="muted" style={{ fontSize: "0.8rem" }}>
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
                Rendering…
              </div>
            )}
            <div>
              <strong>{video.draft?.hook || "Untitled"}</strong>
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
              Session: {video.heygenSessionId || "—"}
            </div>
          </div>
        ))}
      </div>
      {!videos.length ? <p className="muted">No videos yet.</p> : null}
    </div>
  );
}
