"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, Clapperboard, Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useLocale } from "@/i18n/LocaleProvider";

type Draft = {
  id: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  cta: string;
  visualStyle: string;
  suggestedDurationSec: number | null;
  status: string;
  voiceId: string | null;
  avatarId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type Voice = {
  voice_id: string;
  name?: string;
  language?: string;
  gender?: string;
};

type SortKey = "caption" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS = [
  "draft",
  "approved",
  "generating",
  "ready",
  "scheduled",
  "posted",
  "failed",
] as const;

function TipCell({
  preview,
  full,
  lines = 3,
}: {
  preview: React.ReactNode;
  full: string;
  lines?: 2 | 3;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  function clearClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function placeTooltip() {
    const el = ref.current;
    if (!el) return;
    clearClose();

    const rect = el.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const width = Math.min(
      Math.max(rect.width, 320),
      Math.min(560, window.innerWidth - margin * 2),
    );
    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin);
    }

    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, placeAbove ? spaceAbove : spaceBelow);

    setStyle({
      position: "fixed",
      top: placeAbove ? undefined : rect.bottom + gap,
      bottom: placeAbove ? window.innerHeight - rect.top + gap : undefined,
      left,
      width,
      maxHeight,
      zIndex: 1000,
    });
  }

  function scheduleClose() {
    clearClose();
    closeTimer.current = setTimeout(() => setStyle(null), 120);
  }

  return (
    <div
      className="tip-cell"
      ref={ref}
      onMouseEnter={placeTooltip}
      onMouseLeave={scheduleClose}
    >
      <div className={lines === 2 ? "clamp-2" : "clamp-3"}>{preview}</div>
      {style
        ? createPortal(
            <div
              className="tip-bubble-portal"
              role="tooltip"
              style={style}
              onMouseEnter={clearClose}
              onMouseLeave={scheduleClose}
            >
              {full}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function DraftsPage() {
  const { t, tf } = useLocale();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [ideasText, setIdeasText] = useState("");
  const [brandTone, setBrandTone] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    const res = await fetch("/api/drafts");
    const data = await res.json();
    setDrafts(data.drafts ?? []);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/heygen/voices")
      .then((r) => (r.ok ? r.json() : { voices: [] }))
      .then((d) => setVoices(d.voices ?? []))
      .catch(() => setVoices([]));
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = drafts.filter((d) => {
      if (statusFilter && d.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${d.hook}\n${d.script}\n${d.caption}`.toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      const av =
        sortKey === "createdAt"
          ? new Date(a.createdAt).getTime()
          : String(a[sortKey] ?? "").toLowerCase();
      const bv =
        sortKey === "createdAt"
          ? new Date(b.createdAt).getTime()
          : String(b[sortKey] ?? "").toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [drafts, statusFilter, search, sortKey, sortDir]);

  const selectableIds = useMemo(
    () =>
      visible
        .filter(
          (d) => !["generating", "ready", "scheduled", "posted"].includes(d.status),
        )
        .map((d) => d.id),
    [visible],
  );

  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

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

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allSelectableSelected) {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  async function createFromIdeas(e: FormEvent) {
    e.preventDefault();
    if (!ideasText.trim()) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideasText, brandTone, visualStyle }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setMessage(
      tf(t.drafts.created, { count: data.drafts?.length ?? 0 }) +
        (data.errors?.length
          ? tf(t.drafts.errors, { count: data.errors.length })
          : ""),
    );
    setIdeasText("");
    setAddOpen(false);
    await load();
  }

  async function saveDraft() {
    if (!editing) return;
    setLoading(true);
    const res = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error || "Save failed");
      return;
    }
    setEditing(null);
    setMessage(t.drafts.saved);
    await load();
  }

  async function approveDraft(id: string) {
    setLoading(true);
    setMessage(null);
    await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    setLoading(false);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await load();
  }

  async function approveSelected() {
    setLoading(true);
    for (const id of selected) {
      await fetch("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "approved" }),
      });
    }
    setLoading(false);
    setSelected(new Set());
    await load();
  }

  async function generateDraft(id: string) {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftIds: [id] }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Generate failed");
      return;
    }
    setMessage(tf(t.drafts.started, { count: data.videos?.length ?? 0 }));
    await load();
  }

  async function generateSelected() {
    if (!selected.size) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftIds: [...selected] }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Generate failed");
      return;
    }
    setMessage(
      tf(t.drafts.started, { count: data.videos?.length ?? 0 }) +
        (data.errors?.length
          ? tf(t.drafts.errors, { count: data.errors.length })
          : ""),
    );
    setSelected(new Set());
    await load();
  }

  async function deleteDraft(id: string) {
    if (!confirm(t.drafts.deleteConfirm)) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Delete failed");
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setMessage(t.drafts.deleted);
    await load();
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (
      !confirm(
        tf(t.drafts.deleteSelectedConfirm, { count: selected.size }),
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage(null);
    const ids = [...selected];
    const res = await fetch("/api/drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Delete failed");
      return;
    }
    setSelected(new Set());
    setMessage(tf(t.drafts.deletedMany, { count: ids.length }));
    await load();
  }

  const fieldLabels = [
    ["hook", t.drafts.hook],
    ["script", t.drafts.script],
    ["caption", t.drafts.caption],
    ["cta", t.drafts.cta],
    ["visualStyle", t.drafts.visualStyleField],
  ] as const;

  function canAct(status: string) {
    return !["generating", "ready", "scheduled", "posted"].includes(status);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t.drafts.title}</h1>
          <p className="muted">{t.drafts.subtitle}</p>
        </div>
        <button className="btn" type="button" onClick={() => setAddOpen(true)}>
          {t.drafts.addDrafts}
        </button>
      </div>

      <div className="row">
        <div className="actions-cell">
          <button
            className="btn btn-secondary btn-icon"
            type="button"
            disabled={!selected.size || loading}
            title={t.drafts.approve}
            aria-label={t.drafts.approve}
            onClick={approveSelected}
          >
            <Check size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            className="btn btn-icon"
            type="button"
            disabled={!selected.size || loading}
            title={`${t.drafts.generate} (${selected.size})`}
            aria-label={`${t.drafts.generate} (${selected.size})`}
            onClick={generateSelected}
          >
            <Clapperboard size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            className="btn btn-danger btn-icon"
            type="button"
            disabled={!selected.size || loading}
            title={t.drafts.deleteSelected}
            aria-label={t.drafts.deleteSelected}
            onClick={deleteSelected}
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
          <label className="label">{t.drafts.filterSearch}</label>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.drafts.filterSearch}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label className="label">{t.drafts.filterStatus}</label>
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t.drafts.filterAll}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
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
                  checked={allSelectableSelected}
                  onChange={toggleSelectAll}
                  disabled={!selectableIds.length}
                  aria-label="Select all"
                />
              </th>
              <th
                className="th-sort col-fill"
                onClick={() => toggleSort("caption")}
              >
                {t.drafts.caption}
                {sortMark("caption")}
              </th>
              <th
                className="th-sort col-status"
                onClick={() => toggleSort("status")}
              >
                {t.status}
                {sortMark("status")}
              </th>
              <th
                className="th-sort col-date"
                onClick={() => toggleSort("createdAt")}
              >
                {t.created}
                {sortMark("createdAt")}
              </th>
              <th className="col-actions">{t.drafts.actions}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((draft) => {
              const details = [
                draft.hook ? `${t.drafts.hook}\n${draft.hook}` : "",
                draft.script ? `${t.drafts.script}\n${draft.script}` : "",
                draft.caption ? `${t.drafts.caption}\n${draft.caption}` : "",
                draft.cta ? `${t.drafts.cta}\n${draft.cta}` : "",
                draft.visualStyle
                  ? `${t.drafts.visualStyleField}\n${draft.visualStyle}`
                  : "",
                (draft.hashtags ?? []).length
                  ? `${t.drafts.hashtags}\n${(draft.hashtags ?? [])
                      .map((h) => `#${h}`)
                      .join(" ")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n");
              return (
                <tr key={draft.id}>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={selected.has(draft.id)}
                      onChange={() => toggle(draft.id)}
                      disabled={!canAct(draft.status)}
                    />
                  </td>
                  <td className="col-fill">
                    <TipCell
                      lines={3}
                      full={details}
                      preview={
                        <>
                          <div>{draft.caption}</div>
                          <div className="muted" style={{ marginTop: 4 }}>
                            {(draft.hashtags ?? []).map((h) => `#${h}`).join(" ")}
                          </div>
                        </>
                      }
                    />
                  </td>
                  <td className="col-status">
                    <StatusBadge status={draft.status} />
                    {draft.errorMessage ? (
                      <div
                        style={{
                          color: "var(--danger)",
                          fontSize: "0.8rem",
                          marginTop: 6,
                        }}
                      >
                        {draft.errorMessage}
                      </div>
                    ) : null}
                  </td>
                  <td className="col-date muted">
                    {draft.createdAt
                      ? new Date(draft.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="col-actions">
                    <div className="actions-cell">
                      <button
                        className="btn btn-secondary btn-icon"
                        type="button"
                        disabled={loading}
                        title={t.edit}
                        aria-label={t.edit}
                        onClick={() => setEditing(draft)}
                      >
                        <Pencil size={16} strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        className="btn btn-secondary btn-icon"
                        type="button"
                        disabled={loading || !canAct(draft.status)}
                        title={t.drafts.approveOne}
                        aria-label={t.drafts.approveOne}
                        onClick={() => approveDraft(draft.id)}
                      >
                        <Check size={16} strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        className="btn btn-icon"
                        type="button"
                        disabled={loading || !canAct(draft.status)}
                        title={t.drafts.generateOne}
                        aria-label={t.drafts.generateOne}
                        onClick={() => generateDraft(draft.id)}
                      >
                        <Clapperboard size={16} strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        className="btn btn-danger btn-icon"
                        type="button"
                        disabled={loading}
                        title={t.drafts.deleteOne}
                        aria-label={t.drafts.deleteOne}
                        onClick={() => deleteDraft(draft.id)}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visible.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  {drafts.length ? t.drafts.emptyFiltered : t.drafts.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {addOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000a",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <form
            className="card stack"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onSubmit={createFromIdeas}
          >
            <h2 style={{ margin: 0 }}>{t.drafts.addTitle}</h2>
            <div>
              <label className="label">{t.drafts.ideasLabel}</label>
              <textarea
                className="textarea"
                style={{ minHeight: 160 }}
                required
                value={ideasText}
                onChange={(e) => setIdeasText(e.target.value)}
                placeholder={t.drafts.ideasPlaceholder}
              />
            </div>
            <div>
              <label className="label">{t.drafts.brandTone}</label>
              <textarea
                className="textarea"
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                placeholder={t.drafts.brandPlaceholder}
              />
            </div>
            <div>
              <label className="label">{t.drafts.visualStyle}</label>
              <textarea
                className="textarea"
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value)}
                placeholder={t.drafts.stylePlaceholder}
              />
              <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                {t.drafts.styleHint}
              </div>
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={loading}>
                {loading ? t.drafts.creating : t.drafts.create}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={loading}
              >
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editing ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000a",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            className="card stack"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h2 style={{ margin: 0 }}>{t.drafts.editTitle}</h2>
            {fieldLabels.map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <textarea
                  className="textarea"
                  value={editing[key]}
                  onChange={(e) =>
                    setEditing({ ...editing, [key]: e.target.value })
                  }
                />
              </div>
            ))}
            <div>
              <label className="label">{t.drafts.hashtags}</label>
              <input
                className="input"
                value={(editing.hashtags ?? []).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    hashtags: e.target.value
                      .split(",")
                      .map((x) => x.trim().replace(/^#/, ""))
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div>
              <label className="label">{t.drafts.voice}</label>
              <select
                className="select"
                value={editing.voiceId ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, voiceId: e.target.value || null })
                }
              >
                <option value="">{t.drafts.voiceDefault}</option>
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name || v.voice_id}
                    {v.language ? ` (${v.language})` : ""}
                    {v.gender ? ` · ${v.gender}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t.drafts.avatarId}</label>
              <input
                className="input"
                value={editing.avatarId ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, avatarId: e.target.value || null })
                }
              />
            </div>
            <div className="row">
              <button className="btn" onClick={saveDraft} disabled={loading}>
                {t.save}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setEditing(null)}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
