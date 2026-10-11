"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { useLocale } from "@/i18n/LocaleProvider";

type VideoRow = {
  id: string;
  status: string;
  publicUrl: string | null;
  draft: { hook: string; caption: string; hashtags: string[] } | null;
};

type Channel = {
  id: string;
  channelId: string;
  displayName: string | null;
  service: string | null;
  accountLabel: string;
};

type Post = {
  id: string;
  text: string;
  mode: string;
  dueAt: string | null;
  status: string;
  bufferPostId: string | null;
  createdAt: string;
};

export default function SchedulePage() {
  const { t } = useLocale();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [videoId, setVideoId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"addToQueue" | "customScheduled">("addToQueue");
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [vRes, cRes, pRes] = await Promise.all([
      fetch("/api/videos"),
      fetch("/api/buffer/channels"),
      fetch("/api/posts"),
    ]);
    const vData = await vRes.json();
    const cData = await cRes.json();
    const pData = await pRes.json();
    const ready = (vData.videos ?? []).filter(
      (v: VideoRow) => v.status === "ready" && v.publicUrl,
    );
    setVideos(ready);
    setChannels(cData.channels ?? []);
    setPosts(pData.posts ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const video = videos.find((v) => v.id === videoId);
    if (!video?.draft) return;
    const tags = (video.draft.hashtags ?? []).map((h) => `#${h}`).join(" ");
    setText(`${video.draft.caption}\n\n${tags}`.trim());
  }, [videoId, videos]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        channelId,
        text,
        mode,
        dueAt: mode === "customScheduled" ? new Date(dueAt).toISOString() : undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to schedule");
      return;
    }
    setMessage(t.schedule.success);
    setVideoId("");
    await load();
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>{t.schedule.title}</h1>
        <p className="muted">{t.schedule.subtitle}</p>
      </div>

      <form className="card stack" onSubmit={onSubmit}>
        <div>
          <label className="label">{t.schedule.readyVideo}</label>
          <select
            className="select"
            required
            value={videoId}
            onChange={(e) => setVideoId(e.target.value)}
          >
            <option value="">{t.schedule.selectVideo}</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.draft?.hook || v.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.schedule.channel}</label>
          <select
            className="select"
            required
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">{t.schedule.selectChannel}</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                [{ch.accountLabel}] {ch.service} — {ch.displayName || ch.channelId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.schedule.postText}</label>
          <textarea
            className="textarea"
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="label">{t.schedule.mode}</label>
            <select
              className="select"
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as "addToQueue" | "customScheduled")
              }
            >
              <option value="addToQueue">{t.schedule.addToQueue}</option>
              <option value="customScheduled">{t.schedule.customSchedule}</option>
            </select>
          </div>
          {mode === "customScheduled" ? (
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="label">{t.schedule.dueAt}</label>
              <input
                className="input"
                type="datetime-local"
                required
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? t.schedule.submitting : t.schedule.submit}
        </button>
        {message ? <div className="muted">{message}</div> : null}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>{t.schedule.listTitle}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{t.schedule.text}</th>
              <th>{t.schedule.mode}</th>
              <th>{t.schedule.due}</th>
              <th>{t.status}</th>
              <th>{t.schedule.bufferId}</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>
                  {p.text.slice(0, 160)}
                  {p.text.length > 160 ? "…" : ""}
                </td>
                <td>{p.mode}</td>
                <td className="muted">
                  {p.dueAt ? new Date(p.dueAt).toLocaleString() : t.schedule.queue}
                </td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td className="muted">{p.bufferPostId}</td>
              </tr>
            ))}
            {!posts.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  {t.schedule.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
