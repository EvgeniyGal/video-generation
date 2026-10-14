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
import { Check, Clapperboard, Loader2, Pencil, Trash2 } from "lucide-react";
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
  language: string;
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
  type?: string;
};

type AvatarLook = {
  id: string;
  name?: string;
  gender?: string;
  avatar_type?: string;
  ownership?: string;
};

type GroupedList<T> = {
  own: T[];
  general: T[];
};

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

type GenerateTarget =
  | { mode: "one"; id: string }
  | { mode: "many"; ids: string[] };

type VideoGenType = "heygen" | "slideshow";

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
  const [voicesGrouped, setVoicesGrouped] = useState<GroupedList<Voice>>({
    own: [],
    general: [],
  });
  const [avatarsGrouped, setAvatarsGrouped] = useState<GroupedList<AvatarLook>>(
    {
      own: [],
      general: [],
    },
  );
  const [editing, setEditing] = useState<Draft | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [ideasText, setIdeasText] = useState("");
  const [contentLanguage, setContentLanguage] = useState<"en" | "ua">("ua");
  const [estimatedDurationSec, setEstimatedDurationSec] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<
    null | { mode: "one"; id: string } | { mode: "many"; ids: string[] }
  >(null);
  const [generateTarget, setGenerateTarget] = useState<GenerateTarget | null>(
    null,
  );
  const [genType, setGenType] = useState<VideoGenType>("heygen");
  const [genVoiceId, setGenVoiceId] = useState("");
  const [genAvatarId, setGenAvatarId] = useState("");
  const [genElevenVoiceId, setGenElevenVoiceId] = useState("");
  const [genSceneCount, setGenSceneCount] = useState(4);
  const [genConsistentCharacter, setGenConsistentCharacter] = useState(true);
  const [genSubtitles, setGenSubtitles] = useState(true);
  const [genBlueprintId, setGenBlueprintId] = useState("");
  const [blueprints, setBlueprints] = useState<
    Array<{
      id: string;
      name: string;
      isDefault: boolean;
      defaults?: {
        sceneCount?: number;
        consistentCharacter?: boolean;
        subtitles?: boolean;
      };
    }>
  >([]);
  const [elevenVoices, setElevenVoices] = useState<ElevenLabsVoice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    const res = await fetch("/api/drafts");
    const data = await res.json();
    setDrafts(data.drafts ?? []);
  }, []);

  const loadBlueprints = useCallback(async () => {
    const res = await fetch("/api/blueprints");
    const data = await res.json();
    const list = data.blueprints ?? [];
    setBlueprints(list);
    const def = list.find((b: { isDefault: boolean }) => b.isDefault);
    if (def) setGenBlueprintId(def.id);
  }, []);

  useEffect(() => {
    load();
    loadBlueprints();
    fetch("/api/elevenlabs/voices")
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as { voices?: ElevenLabsVoice[] };
        setElevenVoices(d.voices ?? []);
      })
      .catch(() => setElevenVoices([]));
    fetch("/api/heygen/voices")
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as {
          voices?: Voice[];
          voicesGrouped?: GroupedList<Voice>;
          avatarsGrouped?: GroupedList<AvatarLook>;
        };
        if (d.voicesGrouped) {
          setVoicesGrouped({
            own: d.voicesGrouped.own ?? [],
            general: d.voicesGrouped.general ?? [],
          });
        } else {
          setVoicesGrouped({ own: [], general: d.voices ?? [] });
        }
        setAvatarsGrouped({
          own: d.avatarsGrouped?.own ?? [],
          general: d.avatarsGrouped?.general ?? [],
        });
      })
      .catch(() => {
        setVoicesGrouped({ own: [], general: [] });
        setAvatarsGrouped({ own: [], general: [] });
      });
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
    if (!ideasText.trim() || creating) return;
    if (estimatedDurationSec < 5 || estimatedDurationSec > 90) {
      setMessage(t.drafts.estimatedDurationHint);
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideasText,
          language: contentLanguage,
          suggestedDurationSec: estimatedDurationSec,
        }),
      });
      const data = await res.json();
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
    } finally {
      setCreating(false);
    }
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

  function applyBlueprintDefaults(blueprintId: string) {
    const bp = blueprints.find((b) => b.id === blueprintId);
    if (!bp?.defaults) return;
    if (bp.defaults.sceneCount) setGenSceneCount(bp.defaults.sceneCount);
    if (bp.defaults.consistentCharacter !== undefined) {
      setGenConsistentCharacter(bp.defaults.consistentCharacter !== false);
    }
    if (bp.defaults.subtitles !== undefined) {
      setGenSubtitles(bp.defaults.subtitles !== false);
    }
  }

  function openGenerateOne(id: string) {
    const draft = drafts.find((d) => d.id === id);
    setGenVoiceId(draft?.voiceId ?? "");
    setGenAvatarId(draft?.avatarId ?? "");
    setGenType("heygen");
    const def = blueprints.find((b) => b.isDefault);
    const bpId = def?.id ?? genBlueprintId;
    setGenBlueprintId(bpId);
    setGenSceneCount(def?.defaults?.sceneCount ?? 4);
    setGenConsistentCharacter(def?.defaults?.consistentCharacter !== false);
    setGenSubtitles(def?.defaults?.subtitles !== false);
    setGenerateTarget({ mode: "one", id });
  }

  function openGenerateSelected() {
    if (!selected.size) return;
    const first = drafts.find((d) => selected.has(d.id));
    setGenVoiceId(first?.voiceId ?? "");
    setGenAvatarId(first?.avatarId ?? "");
    setGenType("heygen");
    const def = blueprints.find((b) => b.isDefault);
    const bpId = def?.id ?? genBlueprintId;
    setGenBlueprintId(bpId);
    setGenSceneCount(def?.defaults?.sceneCount ?? 4);
    setGenConsistentCharacter(def?.defaults?.consistentCharacter !== false);
    setGenSubtitles(def?.defaults?.subtitles !== false);
    setGenerateTarget({ mode: "many", ids: [...selected] });
  }

  async function confirmGenerate() {
    if (!generateTarget) return;
    const draftIds =
      generateTarget.mode === "one"
        ? [generateTarget.id]
        : generateTarget.ids;

    setLoading(true);
    setMessage(null);

    const body =
      genType === "heygen"
        ? {
            draftIds,
            type: "heygen" as const,
            voiceId: genVoiceId || null,
            avatarId: genAvatarId || null,
            blueprintId: genBlueprintId || undefined,
          }
        : {
            draftIds,
            type: "slideshow" as const,
            elevenLabsVoiceId: genElevenVoiceId,
            sceneCount: genSceneCount,
            consistentCharacter: genConsistentCharacter,
            subtitles: genSubtitles,
            blueprintId: genBlueprintId || undefined,
          };

    if (genType === "slideshow" && !genElevenVoiceId) {
      setLoading(false);
      setMessage(t.drafts.elevenLabsVoiceDefault);
      return;
    }

    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    setGenerateTarget(null);
    if (generateTarget.mode === "many") setSelected(new Set());
    await load();
  }

  function requestDeleteDraft(id: string) {
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
    const res = await fetch("/api/drafts", {
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
      setMessage(t.drafts.deleted);
    } else {
      setSelected(new Set());
      setMessage(tf(t.drafts.deletedMany, { count }));
    }
    setDeleteTarget(null);
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
            onClick={openGenerateSelected}
          >
            <Clapperboard size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            className="btn btn-danger btn-icon"
            type="button"
            disabled={!selected.size || loading}
            title={t.drafts.deleteSelected}
            aria-label={t.drafts.deleteSelected}
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
                `${t.drafts.contentLanguage}\n${
                  draft.language === "ua" ? t.drafts.langUa : t.drafts.langEn
                }`,
                draft.suggestedDurationSec
                  ? `${t.drafts.estimatedDuration}\n${draft.suggestedDurationSec}s`
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
                        onClick={() => openGenerateOne(draft.id)}
                      >
                        <Clapperboard size={16} strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        className="btn btn-danger btn-icon"
                        type="button"
                        disabled={loading}
                        title={t.drafts.deleteOne}
                        aria-label={t.drafts.deleteOne}
                        onClick={() => requestDeleteDraft(draft.id)}
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
            aria-labelledby="delete-draft-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-draft-title" style={{ margin: 0 }}>
              {deleteTarget.mode === "one"
                ? t.drafts.deleteConfirmTitle
                : tf(t.drafts.deleteSelectedConfirmTitle, {
                    count: deleteTarget.ids.length,
                  })}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {deleteTarget.mode === "one"
                ? t.drafts.deleteConfirm
                : t.drafts.deleteSelectedConfirm}
            </p>
            <div className="row">
              <button
                className="btn btn-danger"
                type="button"
                disabled={loading}
                onClick={confirmDelete}
              >
                {t.drafts.deleteConfirmAction}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading}
                onClick={() => setDeleteTarget(null)}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
              position: "relative",
            }}
            onSubmit={createFromIdeas}
            aria-busy={creating}
          >
            <h2 style={{ margin: 0 }}>{t.drafts.addTitle}</h2>
            <div>
              <label className="label">{t.drafts.ideasLabel}</label>
              <textarea
                className="textarea"
                style={{ minHeight: 160 }}
                required
                disabled={creating}
                value={ideasText}
                onChange={(e) => setIdeasText(e.target.value)}
                placeholder={t.drafts.ideasPlaceholder}
              />
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="label" htmlFor="draft-language">
                  {t.drafts.contentLanguage} *
                </label>
                <select
                  id="draft-language"
                  className="select"
                  required
                  disabled={creating}
                  value={contentLanguage}
                  onChange={(e) =>
                    setContentLanguage(e.target.value as "en" | "ua")
                  }
                >
                  <option value="ua">{t.drafts.langUa}</option>
                  <option value="en">{t.drafts.langEn}</option>
                </select>
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                  {t.drafts.contentLanguageHint}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="label" htmlFor="draft-duration">
                  {t.drafts.estimatedDuration} *
                </label>
                <input
                  id="draft-duration"
                  className="input"
                  type="number"
                  required
                  min={5}
                  max={90}
                  step={1}
                  disabled={creating}
                  value={estimatedDurationSec}
                  onChange={(e) =>
                    setEstimatedDurationSec(Number(e.target.value) || 0)
                  }
                />
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                  {t.drafts.estimatedDurationHint}
                </div>
              </div>
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2
                      className="spin"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    {t.drafts.creating}
                  </>
                ) : (
                  t.drafts.create
                )}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={creating}
              >
                {t.cancel}
              </button>
            </div>

            {creating ? (
              <div className="ai-busy" role="status" aria-live="polite">
                <Loader2 className="spin" size={36} strokeWidth={2} aria-hidden />
                <div style={{ fontWeight: 600 }}>{t.drafts.creating}</div>
                <div className="muted" style={{ fontSize: "0.9rem", textAlign: "center" }}>
                  {t.drafts.creatingHint}
                </div>
              </div>
            ) : null}
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
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="label">{t.drafts.contentLanguage}</label>
                <select
                  className="select"
                  value={editing.language === "ua" ? "ua" : "en"}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      language: e.target.value,
                    })
                  }
                >
                  <option value="ua">{t.drafts.langUa}</option>
                  <option value="en">{t.drafts.langEn}</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="label">{t.drafts.estimatedDuration}</label>
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={90}
                  step={1}
                  value={editing.suggestedDurationSec ?? 30}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      suggestedDurationSec: Number(e.target.value) || 30,
                    })
                  }
                />
              </div>
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

      {generateTarget ? (
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
              width: "min(560px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h2 style={{ margin: 0 }}>
              {generateTarget.mode === "one"
                ? t.drafts.generateTitle
                : tf(t.drafts.generateTitleMany, {
                    count: generateTarget.ids.length,
                  })}
            </h2>

            <div>
              <label className="label">{t.drafts.generateType}</label>
              <select
                className="select"
                value={genType}
                onChange={(e) => setGenType(e.target.value as VideoGenType)}
              >
                <option value="heygen">{t.drafts.typeHeygen}</option>
                <option value="slideshow">{t.drafts.typeSlideshow}</option>
              </select>
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>
                {genType === "heygen"
                  ? t.drafts.typeHeygenHint
                  : t.drafts.typeSlideshowHint}
              </div>
            </div>

            <div>
              <label className="label">{t.drafts.blueprint}</label>
              <select
                className="select"
                value={genBlueprintId}
                onChange={(e) => {
                  const id = e.target.value;
                  setGenBlueprintId(id);
                  if (id) applyBlueprintDefaults(id);
                }}
              >
                <option value="">{t.blueprints.selectNone}</option>
                {blueprints.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.isDefault ? ` (${t.blueprints.defaultBadge})` : ""}
                  </option>
                ))}
              </select>
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>
                {t.drafts.blueprintHint}
              </div>
            </div>

            {genType === "heygen" ? (
              <>
                <div>
                  <label className="label">{t.drafts.voice}</label>
                  <select
                    className="select"
                    value={genVoiceId}
                    onChange={(e) => setGenVoiceId(e.target.value)}
                  >
                    <option value="">{t.drafts.voiceDefault}</option>
                    {voicesGrouped.own.length ? (
                      <optgroup label={t.drafts.voiceOwn}>
                        {voicesGrouped.own.map((v) => (
                          <option key={v.voice_id} value={v.voice_id}>
                            {v.name || v.voice_id}
                            {v.language ? ` (${v.language})` : ""}
                            {v.gender ? ` · ${v.gender}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {voicesGrouped.general.length ? (
                      <optgroup label={t.drafts.voiceGeneral}>
                        {voicesGrouped.general.map((v) => (
                          <option key={v.voice_id} value={v.voice_id}>
                            {v.name || v.voice_id}
                            {v.language ? ` (${v.language})` : ""}
                            {v.gender ? ` · ${v.gender}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </div>
                <div>
                  <label className="label">{t.drafts.avatarId}</label>
                  <select
                    className="select"
                    value={genAvatarId}
                    onChange={(e) => setGenAvatarId(e.target.value)}
                  >
                    <option value="">{t.drafts.avatarDefault}</option>
                    {avatarsGrouped.own.length ? (
                      <optgroup label={t.drafts.avatarOwn}>
                        {avatarsGrouped.own.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name || a.id}
                            {a.gender ? ` · ${a.gender}` : ""}
                            {a.avatar_type ? ` · ${a.avatar_type}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {avatarsGrouped.general.length ? (
                      <optgroup label={t.drafts.avatarGeneral}>
                        {avatarsGrouped.general.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name || a.id}
                            {a.gender ? ` · ${a.gender}` : ""}
                            {a.avatar_type ? ` · ${a.avatar_type}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  {!avatarsGrouped.own.length &&
                  !avatarsGrouped.general.length ? (
                    <div
                      className="muted"
                      style={{ fontSize: "0.8rem", marginTop: 6 }}
                    >
                      {t.drafts.avatarEmpty}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">{t.drafts.elevenLabsVoice}</label>
                  <select
                    className="select"
                    value={genElevenVoiceId}
                    onChange={(e) => setGenElevenVoiceId(e.target.value)}
                  >
                    <option value="">{t.drafts.elevenLabsVoiceDefault}</option>
                    {elevenVoices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name || v.voice_id}
                        {v.labels?.language
                          ? ` (${v.labels.language})`
                          : ""}
                        {v.category ? ` · ${v.category}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{t.drafts.sceneCount}</label>
                  <input
                    className="input"
                    type="number"
                    min={3}
                    max={8}
                    step={1}
                    value={genSceneCount}
                    onChange={(e) =>
                      setGenSceneCount(
                        Math.min(8, Math.max(3, Number(e.target.value) || 4)),
                      )
                    }
                  />
                  <div
                    className="muted"
                    style={{ fontSize: "0.8rem", marginTop: 6 }}
                  >
                    {t.drafts.sceneCountHint}
                  </div>
                </div>
                <label
                  className="row"
                  style={{ gap: 8, alignItems: "flex-start" }}
                >
                  <input
                    type="checkbox"
                    checked={genConsistentCharacter}
                    onChange={(e) =>
                      setGenConsistentCharacter(e.target.checked)
                    }
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <strong>{t.drafts.consistentCharacter}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {t.drafts.consistentCharacterHint}
                    </div>
                  </span>
                </label>
                <label
                  className="row"
                  style={{ gap: 8, alignItems: "flex-start" }}
                >
                  <input
                    type="checkbox"
                    checked={genSubtitles}
                    onChange={(e) => setGenSubtitles(e.target.checked)}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <strong>{t.drafts.subtitles}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {t.drafts.subtitlesHint}
                    </div>
                  </span>
                </label>
              </>
            )}

            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={loading}
                onClick={confirmGenerate}
              >
                {t.drafts.startGenerate}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading}
                onClick={() => setGenerateTarget(null)}
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
