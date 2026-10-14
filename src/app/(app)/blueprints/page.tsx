"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, Wand2 } from "lucide-react";
import { useLocale } from "@/i18n/LocaleProvider";

type BlueprintDefaults = {
  sceneCount?: number;
  consistentCharacter?: boolean;
  subtitles?: boolean;
  slideCount?: number;
  heygenNotes?: string;
  carouselAestheticNotes?: string;
};

type Blueprint = {
  id: string;
  name: string;
  description: string;
  brandTone: string;
  visualStyle: string;
  language: string;
  defaults: BlueprintDefaults;
  dramaNotes: string;
  visualArcNotes: string;
  subtitleNotes: string;
  sourceReview: string | null;
  isDefault: boolean;
  updatedAt: string;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  brandTone: string;
  visualStyle: string;
  language: "en" | "ua";
  dramaNotes: string;
  visualArcNotes: string;
  subtitleNotes: string;
  sourceReview: string;
  isDefault: boolean;
  sceneCount: number;
  consistentCharacter: boolean;
  subtitles: boolean;
  slideCount: number;
  heygenNotes: string;
  carouselAestheticNotes: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    brandTone: "",
    visualStyle: "",
    language: "ua",
    dramaNotes: "",
    visualArcNotes: "",
    subtitleNotes: "",
    sourceReview: "",
    isDefault: false,
    sceneCount: 4,
    consistentCharacter: true,
    subtitles: true,
    slideCount: 5,
    heygenNotes: "",
    carouselAestheticNotes: "",
  };
}

function fromBlueprint(b: Blueprint): FormState {
  return {
    id: b.id,
    name: b.name,
    description: b.description ?? "",
    brandTone: b.brandTone ?? "",
    visualStyle: b.visualStyle ?? "",
    language: b.language === "en" ? "en" : "ua",
    dramaNotes: b.dramaNotes ?? "",
    visualArcNotes: b.visualArcNotes ?? "",
    subtitleNotes: b.subtitleNotes ?? "",
    sourceReview: b.sourceReview ?? "",
    isDefault: Boolean(b.isDefault),
    sceneCount: b.defaults?.sceneCount ?? 4,
    consistentCharacter: b.defaults?.consistentCharacter !== false,
    subtitles: b.defaults?.subtitles !== false,
    slideCount: b.defaults?.slideCount ?? 5,
    heygenNotes: b.defaults?.heygenNotes ?? "",
    carouselAestheticNotes: b.defaults?.carouselAestheticNotes ?? "",
  };
}

export default function BlueprintsPage() {
  const { t } = useLocale();
  const [rows, setRows] = useState<Blueprint[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/blueprints");
    const data = await res.json();
    setRows(data.blueprints ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patchForm(partial: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  async function saveForm(e: FormEvent) {
    e.preventDefault();
    if (!form || !form.name.trim() || loading) return;
    setLoading(true);
    setMessage(null);
    const payload = {
      id: form.id,
      name: form.name.trim(),
      description: form.description,
      brandTone: form.brandTone,
      visualStyle: form.visualStyle,
      language: form.language,
      dramaNotes: form.dramaNotes,
      visualArcNotes: form.visualArcNotes,
      subtitleNotes: form.subtitleNotes,
      sourceReview: form.sourceReview || null,
      isDefault: form.isDefault,
      defaults: {
        sceneCount: form.sceneCount,
        consistentCharacter: form.consistentCharacter,
        subtitles: form.subtitles,
        slideCount: form.slideCount,
        heygenNotes: form.heygenNotes,
        carouselAestheticNotes: form.carouselAestheticNotes,
      },
    };
    const res = await fetch("/api/blueprints", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setMessage(t.blueprints.saved);
    setForm(null);
    setAiOpen(false);
    await load();
  }

  async function applyAi() {
    if (!form || !reviewText.trim() || aiLoading) return;
    setAiLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blueprints/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewText,
          language: form.language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "AI fill failed");
        return;
      }
      const s = data.suggested;
      patchForm({
        name: s.name || form.name,
        description: s.description ?? form.description,
        brandTone: s.brandTone ?? "",
        visualStyle: s.visualStyle ?? "",
        language: s.language === "en" ? "en" : "ua",
        dramaNotes: s.dramaNotes ?? "",
        visualArcNotes: s.visualArcNotes ?? "",
        subtitleNotes: s.subtitleNotes ?? "",
        sourceReview: s.sourceReview ?? reviewText,
        sceneCount: s.defaults?.sceneCount ?? 4,
        consistentCharacter: s.defaults?.consistentCharacter !== false,
        subtitles: s.defaults?.subtitles !== false,
        slideCount: s.defaults?.slideCount ?? 5,
        heygenNotes: s.defaults?.heygenNotes ?? "",
        carouselAestheticNotes: s.defaults?.carouselAestheticNotes ?? "",
      });
      setAiOpen(false);
    } finally {
      setAiLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setLoading(true);
    const res = await fetch("/api/blueprints", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Delete failed");
      return;
    }
    setDeleteId(null);
    setMessage(t.blueprints.deleted);
    await load();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t.blueprints.title}</h1>
          <p className="muted">{t.blueprints.subtitle}</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setForm(emptyForm());
            setAiOpen(false);
            setReviewText("");
          }}
        >
          {t.blueprints.create}
        </button>
      </div>

      {message ? <div className="muted">{message}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th className="col-fill">{t.blueprints.name}</th>
              <th className="col-status">{t.blueprints.language}</th>
              <th className="col-date">{t.created}</th>
              <th className="col-actions">{t.blueprints.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="col-fill">
                  <strong>{b.name}</strong>
                  {b.isDefault ? (
                    <span
                      className="badge badge-success"
                      style={{ marginLeft: 8 }}
                    >
                      {t.blueprints.defaultBadge}
                    </span>
                  ) : null}
                  {b.description ? (
                    <div
                      className="muted clamp-2"
                      style={{ fontSize: "0.85rem", marginTop: 4 }}
                    >
                      {b.description}
                    </div>
                  ) : null}
                </td>
                <td className="col-status muted">
                  {(b.language || "ua").toUpperCase()}
                </td>
                <td className="col-date muted">
                  {b.updatedAt
                    ? new Date(b.updatedAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="col-actions">
                  <div className="actions-cell">
                    <button
                      className="btn btn-secondary btn-icon"
                      type="button"
                      title={t.edit}
                      aria-label={t.edit}
                      onClick={() => {
                        setForm(fromBlueprint(b));
                        setAiOpen(false);
                        setReviewText(b.sourceReview ?? "");
                      }}
                    >
                      <Pencil size={16} strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      className="btn btn-danger btn-icon"
                      type="button"
                      title={t.remove}
                      aria-label={t.remove}
                      onClick={() => setDeleteId(b.id)}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={4} className="muted">
                  {t.blueprints.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {form ? (
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
          onClick={() => !loading && setForm(null)}
        >
          <form
            className="card stack"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "92vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveForm}
          >
            <div
              className="row"
              style={{ justifyContent: "space-between", gap: 8 }}
            >
              <h2 style={{ margin: 0 }}>
                {form.id ? t.blueprints.editTitle : t.blueprints.createTitle}
              </h2>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading || aiLoading}
                onClick={() => setAiOpen((v) => !v)}
              >
                <Wand2 size={16} strokeWidth={2} aria-hidden />
                {t.blueprints.fillAi}
              </button>
            </div>

            {aiOpen ? (
              <div
                className="stack"
                style={{
                  padding: "0.85rem",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--bg)",
                }}
              >
                <strong>{t.blueprints.fillAiTitle}</strong>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  {t.blueprints.fillAiHint}
                </p>
                <textarea
                  className="textarea"
                  style={{ minHeight: 140 }}
                  value={reviewText}
                  disabled={aiLoading}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={t.blueprints.reviewLabel}
                />
                <button
                  className="btn"
                  type="button"
                  disabled={aiLoading || !reviewText.trim()}
                  onClick={applyAi}
                >
                  {aiLoading ? t.loading : t.blueprints.applySuggestions}
                </button>
              </div>
            ) : null}

            <div>
              <label className="label">{t.blueprints.name}</label>
              <input
                className="input"
                required
                value={form.name}
                disabled={loading}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.description}</label>
              <textarea
                className="textarea"
                value={form.description}
                disabled={loading}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.language}</label>
              <select
                className="select"
                value={form.language}
                disabled={loading}
                onChange={(e) =>
                  patchForm({ language: e.target.value as "en" | "ua" })
                }
              >
                <option value="ua">{t.drafts.langUa}</option>
                <option value="en">{t.drafts.langEn}</option>
              </select>
            </div>
            <div>
              <label className="label">{t.blueprints.brandTone}</label>
              <textarea
                className="textarea"
                value={form.brandTone}
                disabled={loading}
                placeholder={t.blueprints.brandPlaceholder}
                onChange={(e) => patchForm({ brandTone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.visualStyle}</label>
              <textarea
                className="textarea"
                value={form.visualStyle}
                disabled={loading}
                placeholder={t.blueprints.stylePlaceholder}
                onChange={(e) => patchForm({ visualStyle: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.dramaNotes}</label>
              <textarea
                className="textarea"
                value={form.dramaNotes}
                disabled={loading}
                onChange={(e) => patchForm({ dramaNotes: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.visualArcNotes}</label>
              <textarea
                className="textarea"
                value={form.visualArcNotes}
                disabled={loading}
                onChange={(e) => patchForm({ visualArcNotes: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.subtitleNotes}</label>
              <textarea
                className="textarea"
                value={form.subtitleNotes}
                disabled={loading}
                onChange={(e) => patchForm({ subtitleNotes: e.target.value })}
              />
            </div>

            <div className="row" style={{ gap: "0.75rem" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="label">{t.blueprints.sceneCount}</label>
                <input
                  className="input"
                  type="number"
                  min={3}
                  max={8}
                  value={form.sceneCount}
                  disabled={loading}
                  onChange={(e) =>
                    patchForm({
                      sceneCount: Math.min(
                        8,
                        Math.max(3, Number(e.target.value) || 4),
                      ),
                    })
                  }
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="label">{t.blueprints.slideCount}</label>
                <input
                  className="input"
                  type="number"
                  min={4}
                  max={8}
                  value={form.slideCount}
                  disabled={loading}
                  onChange={(e) =>
                    patchForm({
                      slideCount: Math.min(
                        8,
                        Math.max(4, Number(e.target.value) || 5),
                      ),
                    })
                  }
                />
              </div>
            </div>

            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.consistentCharacter}
                disabled={loading}
                onChange={(e) =>
                  patchForm({ consistentCharacter: e.target.checked })
                }
              />
              <span>{t.blueprints.consistentCharacter}</span>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.subtitles}
                disabled={loading}
                onChange={(e) => patchForm({ subtitles: e.target.checked })}
              />
              <span>{t.blueprints.subtitles}</span>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled={loading}
                onChange={(e) => patchForm({ isDefault: e.target.checked })}
              />
              <span>{t.blueprints.isDefault}</span>
            </label>

            <div>
              <label className="label">{t.blueprints.heygenNotes}</label>
              <textarea
                className="textarea"
                value={form.heygenNotes}
                disabled={loading}
                onChange={(e) => patchForm({ heygenNotes: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t.blueprints.carouselAesthetic}</label>
              <textarea
                className="textarea"
                value={form.carouselAestheticNotes}
                disabled={loading}
                onChange={(e) =>
                  patchForm({ carouselAestheticNotes: e.target.value })
                }
              />
            </div>

            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading}
                onClick={() => setForm(null)}
              >
                {t.cancel}
              </button>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? t.loading : t.save}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteId ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000a",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => !loading && setDeleteId(null)}
        >
          <div
            className="card stack"
            style={{ width: "min(420px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0 }}>{t.blueprints.deleteConfirmTitle}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {t.blueprints.deleteConfirm}
            </p>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading}
                onClick={() => setDeleteId(null)}
              >
                {t.cancel}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={loading}
                onClick={confirmDelete}
              >
                {t.blueprints.deleteConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
