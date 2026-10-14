"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Play, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useLocale } from "@/i18n/LocaleProvider";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  "pending",
  "generating",
  "uploading",
  "ready",
  "failed",
] as const;

const PROVIDER_OPTIONS = ["heygen", "slideshow", "custom"] as const;

type SortKey = "title" | "provider" | "status" | "createdAt";
type SortDir = "asc" | "desc";

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
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<
    null | { mode: "one"; id: string } | { mode: "many"; ids: string[] }
  >(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<VideoRow | null>(null);

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

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, providerFilter, sortKey, sortDir]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = videos.filter((v) => {
      if (statusFilter && v.status !== statusFilter) return false;
      if (providerFilter) {
        const p = v.provider || "heygen";
        if (p !== providerFilter) return false;
      }
      if (!q) return true;
      const hay = `${v.draft?.hook ?? ""}\n${v.draft?.caption ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "createdAt") {
        av = new Date(a.createdAt).getTime();
        bv = new Date(b.createdAt).getTime();
      } else if (sortKey === "title") {
        av = (a.draft?.hook || "").toLowerCase();
        bv = (b.draft?.hook || "").toLowerCase();
      } else if (sortKey === "provider") {
        av = (a.provider || "heygen").toLowerCase();
        bv = (b.provider || "heygen").toLowerCase();
      } else {
        av = (a.status || "").toLowerCase();
        bv = (b.status || "").toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [videos, statusFilter, providerFilter, search, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, currentPage]);

  const pageIds = useMemo(() => pageRows.map((v) => v.id), [pageRows]);

  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function resetUploadForm() {
    setFile(null);
    setHook("");
    setCaption("");
    setHashtags("");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "createdAt" ? "desc" : "asc");
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPage() {
    setSelected((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        for (const id of pageIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of pageIds) next.add(id);
      return next;
    });
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

  function requestDeleteOne(id: string) {
    setDeleteTarget({ mode: "one", id });
  }

  function requestDeleteSelected() {
    if (!selected.size) return;
    setDeleteTarget({ mode: "many", ids: [...selected] });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const payload =
      deleteTarget.mode === "one"
        ? { id: deleteTarget.id }
        : { ids: deleteTarget.ids };
    const count =
      deleteTarget.mode === "one" ? 1 : deleteTarget.ids.length;

    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Delete failed");
      return;
    }

    if (deleteTarget.mode === "one") {
      const id = deleteTarget.id;
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMessage(t.videos.deleted);
    } else {
      setSelected(new Set());
      setMessage(tf(t.videos.deletedMany, { count }));
    }
    setDeleteTarget(null);
    await load();
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

      <div className="row">
        <div className="actions-cell">
          <button
            className="btn btn-danger btn-icon"
            type="button"
            disabled={!selected.size || loading}
            title={t.videos.deleteSelected}
            aria-label={t.videos.deleteSelected}
            onClick={requestDeleteSelected}
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {selected.size ? (
          <span className="muted">({selected.size})</span>
        ) : null}
        {message ? <span className="muted">{message}</span> : null}
      </div>

      <div className="card row" style={{ gap: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="label">{t.videos.filterSearch}</label>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.videos.filterSearch}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="label">{t.videos.filterStatus}</label>
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t.videos.filterAll}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s in t.statuses
                  ? t.statuses[s as keyof typeof t.statuses]
                  : s}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="label">{t.videos.filterProvider}</label>
          <select
            className="select"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="">{t.videos.filterProviderAll}</option>
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {providerLabel(p, t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllPage}
                  disabled={!pageIds.length}
                  aria-label={t.schedule.selectAll}
                />
              </th>
              <th
                className="th-sort col-fill"
                onClick={() => toggleSort("title")}
              >
                {t.videos.titleLabel}
                {sortMark("title")}
              </th>
              <th
                className="th-sort col-status"
                onClick={() => toggleSort("provider")}
              >
                {t.videos.provider}
                {sortMark("provider")}
              </th>
              <th
                className="th-sort col-status"
                onClick={() => toggleSort("status")}
              >
                {t.status}
                {sortMark("status")}
              </th>
              <th className="col-date">{t.videos.duration}</th>
              <th
                className="th-sort col-date"
                onClick={() => toggleSort("createdAt")}
              >
                {t.created}
                {sortMark("createdAt")}
              </th>
              <th className="col-actions">{t.videos.actions}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((video) => (
              <tr key={video.id}>
                <td className="col-check">
                  <input
                    type="checkbox"
                    checked={selected.has(video.id)}
                    onChange={() => toggle(video.id)}
                  />
                </td>
                <td className="col-fill">
                  <div className="clamp-2">
                    {video.draft?.hook || t.videos.untitled}
                  </div>
                  {video.draft?.caption ? (
                    <div
                      className="muted clamp-2"
                      style={{ fontSize: "0.8rem", marginTop: 2 }}
                    >
                      {video.draft.caption}
                    </div>
                  ) : null}
                  {video.provider === "custom" ? (
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {t.videos.providerCustom}
                    </div>
                  ) : null}
                  {video.errorMessage ? (
                    <div
                      style={{
                        color: "var(--danger)",
                        fontSize: "0.8rem",
                        marginTop: 4,
                      }}
                    >
                      {video.errorMessage}
                    </div>
                  ) : null}
                </td>
                <td className="col-status muted">
                  {providerLabel(video.provider, t)}
                </td>
                <td className="col-status">
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <StatusBadge status={video.status} />
                    {video.status === "ready" ? (
                      <StatusBadge
                        status={video.publishStatus ?? "unposted"}
                      />
                    ) : null}
                  </div>
                </td>
                <td className="col-date muted">
                  {video.duration ? `${Math.round(video.duration)}s` : "—"}
                </td>
                <td className="col-date muted">
                  {video.createdAt
                    ? new Date(video.createdAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="col-actions">
                  <div className="actions-cell">
                    {video.publicUrl ? (
                      <button
                        className="btn btn-secondary btn-icon"
                        type="button"
                        title={t.videos.preview}
                        aria-label={t.videos.preview}
                        onClick={() => setPreview(video)}
                      >
                        <Play size={16} strokeWidth={2} aria-hidden />
                      </button>
                    ) : null}
                    <button
                      className="btn btn-danger btn-icon"
                      type="button"
                      disabled={loading}
                      title={t.videos.deleteOne}
                      aria-label={t.videos.deleteOne}
                      onClick={() => requestDeleteOne(video.id)}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length ? (
              <tr>
                <td colSpan={7} className="muted">
                  {videos.length ? t.videos.emptyFiltered : t.videos.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {visible.length > 0 ? (
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {tf(t.videos.pageOf, { page: currentPage, pages: pageCount })}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t.videos.prevPage}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              {t.videos.nextPage}
            </button>
          </div>
        </div>
      ) : null}

      {preview?.publicUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.videos.preview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            display: "grid",
            placeItems: "center",
            zIndex: 70,
            padding: 16,
          }}
          onClick={() => setPreview(null)}
        >
          <div
            className="stack"
            style={{
              width: "min(420px, 100%)",
              maxHeight: "92vh",
              alignItems: "center",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="row"
              style={{
                width: "100%",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong className="clamp-2" style={{ flex: 1, minWidth: 0 }}>
                {preview.draft?.hook || t.videos.untitled}
              </strong>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setPreview(null)}
              >
                {t.cancel}
              </button>
            </div>
            <video
              key={preview.id}
              src={preview.publicUrl}
              controls
              autoPlay
              playsInline
              style={{
                width: "100%",
                maxHeight: "80vh",
                borderRadius: 12,
                background: "#000",
                border: "1px solid var(--border)",
              }}
            />
            {preview.draft?.caption ? (
              <p
                className="muted"
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  width: "100%",
                  whiteSpace: "pre-wrap",
                }}
              >
                {preview.draft.caption}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000a",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 60,
          }}
          onClick={() => !loading && setDeleteTarget(null)}
        >
          <div
            className="card stack"
            style={{ width: "min(440px, 100%)" }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-video-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-video-title" style={{ margin: 0 }}>
              {deleteTarget.mode === "one"
                ? t.videos.deleteConfirmTitle
                : tf(t.videos.deleteSelectedConfirmTitle, {
                    count: deleteTarget.ids.length,
                  })}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {deleteTarget.mode === "one"
                ? t.videos.deleteConfirm
                : t.videos.deleteSelectedConfirm}
            </p>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading}
                onClick={() => setDeleteTarget(null)}
              >
                {t.cancel}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={loading}
                onClick={confirmDelete}
              >
                {t.videos.deleteConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
              <button
                className="btn"
                type="submit"
                disabled={uploading || !file}
              >
                {uploading ? t.videos.uploading : t.videos.uploadSubmit}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
