"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { focusField, reportFormValidity } from "@/lib/form-focus";
import { useLocale } from "@/i18n/LocaleProvider";

type Slide = {
  index: number;
  headline: string;
  body?: string;
  imagePrompt: string;
};

type Draft = {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  language: string;
  niche: string;
  audience: string;
  productMention: string;
  slides: Slide[];
  status: string;
  errorMessage?: string | null;
  createdAt?: string;
};

type CarouselRow = {
  id: string;
  carouselDraftId: string;
  status: string;
  slideUrls: string[];
  errorMessage?: string | null;
};

export default function CarouselsPage() {
  const { t, tf } = useLocale();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [carousels, setCarousels] = useState<CarouselRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [lightbox, setLightbox] = useState<{
    urls: string[];
    index: number;
  } | null>(null);

  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [product, setProduct] = useState("");
  const [seriesHint, setSeriesHint] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [packCount, setPackCount] = useState(1);
  const [language, setLanguage] = useState<"en" | "ua">("en");
  const [blueprintId, setBlueprintId] = useState("");
  const [blueprints, setBlueprints] = useState<
    Array<{
      id: string;
      name: string;
      isDefault: boolean;
      defaults?: { slideCount?: number };
    }>
  >([]);

  const load = useCallback(async () => {
    const [dRes, cRes, bRes] = await Promise.all([
      fetch("/api/carousel-drafts"),
      fetch("/api/carousels"),
      fetch("/api/blueprints"),
    ]);
    const dData = await dRes.json();
    const cData = await cRes.json();
    const bData = await bRes.json();
    setDrafts(dData.drafts ?? []);
    setCarousels(cData.carousels ?? []);
    const list = bData.blueprints ?? [];
    setBlueprints(list);
    const def = list.find((b: { isDefault: boolean }) => b.isDefault);
    if (def) {
      setBlueprintId(def.id);
      if (def.defaults?.slideCount) setSlideCount(def.defaults.slideCount);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLightbox(null);
        return;
      }
      if (e.key === "ArrowLeft") {
        setLightbox((prev) =>
          prev
            ? {
                ...prev,
                index: (prev.index - 1 + prev.urls.length) % prev.urls.length,
              }
            : prev,
        );
      }
      if (e.key === "ArrowRight") {
        setLightbox((prev) =>
          prev
            ? { ...prev, index: (prev.index + 1) % prev.urls.length }
            : prev,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    if (!reportFormValidity(formEl)) {
      setMessage(t.fieldRequired);
      return;
    }
    if (!niche.trim()) {
      setMessage(t.fieldRequired);
      focusField("carousel-niche");
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/carousel-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        niche,
        audience,
        productSoftMention: product,
        seriesHint,
        slideCount,
        count: packCount,
        language,
        blueprintId: blueprintId || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setMessage(
      tf(t.carousels.generated, { count: data.created ?? 0 }) +
        (data.errors?.length
          ? tf(t.carousels.errors, { count: data.errors.length })
          : ""),
    );
    setShowGenerate(false);
    await load();
  }

  async function saveDraft(draft: Draft) {
    setLoading(true);
    const res = await fetch("/api/carousel-drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        hook: draft.hook,
        caption: draft.caption,
        hashtags: draft.hashtags,
        niche: draft.niche,
        audience: draft.audience,
        productMention: draft.productMention,
        slides: draft.slides,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setMessage(t.carousels.saved);
    setEditing(null);
    await load();
  }

  async function approveDraft(id: string) {
    setLoading(true);
    await fetch("/api/carousel-drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    setLoading(false);
    await load();
  }

  async function renderDrafts(ids: string[]) {
    if (!ids.length) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/carousels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftIds: ids }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Render failed");
      return;
    }
    setMessage(
      tf(t.carousels.rendered, { count: data.created ?? 0 }) +
        (data.errors?.length
          ? tf(t.carousels.errors, { count: data.errors.length })
          : ""),
    );
    setSelected(new Set());
    await load();
  }

  async function deleteDraft(id: string) {
    if (!confirm(t.carousels.delete + "?")) return;
    await fetch("/api/carousel-drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const readyByDraft = useMemo(() => {
    const map = new Map<string, CarouselRow>();
    for (const c of carousels) {
      const prev = map.get(c.carouselDraftId);
      if (!prev || (c.status === "ready" && prev.status !== "ready")) {
        map.set(c.carouselDraftId, c);
      }
    }
    return map;
  }, [carousels]);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t.carousels.title}</h1>
          <p className="muted">{t.carousels.subtitle}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!selected.size || loading}
            onClick={() => renderDrafts([...selected])}
          >
            {t.carousels.renderSelected} ({selected.size})
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => setShowGenerate(true)}
          >
            {t.carousels.generate}
          </button>
        </div>
      </div>

      {message ? <div className="muted">{message}</div> : null}
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        {t.carousels.readyHint}
      </p>

      {!drafts.length ? (
        <div className="card muted">{t.carousels.empty}</div>
      ) : (
        <div className="stack">
          {drafts.map((d) => {
            const rendered = readyByDraft.get(d.id);
            return (
              <div key={d.id} className="card stack" style={{ gap: "0.75rem" }}>
                <div
                  className="row"
                  style={{ justifyContent: "space-between", gap: 8 }}
                >
                  <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                      disabled={["generating", "ready", "scheduled", "posted"].includes(
                        d.status,
                      )}
                    />
                    <strong>{d.hook || d.id}</strong>
                  </label>
                  <div className="row" style={{ gap: 6 }}>
                    <StatusBadge status={d.status} />
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {d.language?.toUpperCase()} · {d.slides?.length ?? 0}{" "}
                      {t.carousels.slides.toLowerCase()}
                    </span>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  {d.niche}
                </div>
                {d.errorMessage ? (
                  <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                    {d.errorMessage}
                  </div>
                ) : null}

                {rendered?.status === "ready" && rendered.slideUrls?.length ? (
                  <div>
                    <div className="label">{t.carousels.preview}</div>
                    <div
                      className="row"
                      style={{
                        gap: 8,
                        overflowX: "auto",
                        paddingBottom: 4,
                      }}
                    >
                      {rendered.slideUrls.map((url, idx) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() =>
                            setLightbox({
                              urls: rendered.slideUrls,
                              index: idx,
                            })
                          }
                          title={tf(t.carousels.previewSlide, {
                            n: idx + 1,
                            total: rendered.slideUrls.length,
                          })}
                          style={{
                            padding: 0,
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            background: "transparent",
                            cursor: "pointer",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            style={{
                              height: 160,
                              width: "auto",
                              display: "block",
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setEditing(structuredClone(d))}
                  >
                    {t.edit}
                  </button>
                  {d.status === "draft" || d.status === "failed" ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={loading}
                      onClick={() => approveDraft(d.id)}
                    >
                      {t.carousels.approve}
                    </button>
                  ) : null}
                  {["draft", "approved", "failed"].includes(d.status) ? (
                    <button
                      className="btn"
                      type="button"
                      disabled={loading}
                      onClick={() => renderDrafts([d.id])}
                    >
                      {t.carousels.render}
                    </button>
                  ) : null}
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => deleteDraft(d.id)}
                  >
                    {t.carousels.delete}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showGenerate ? (
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
          onClick={() => !loading && setShowGenerate(false)}
        >
          <form
            className="card stack"
            style={{ width: "min(520px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onGenerate}
          >
            <h2 style={{ margin: 0 }}>{t.carousels.generateTitle}</h2>
            <div>
              <label className="label" htmlFor="carousel-niche">
                {t.carousels.niche} *
              </label>
              <textarea
                id="carousel-niche"
                className="textarea"
                required
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder={t.carousels.nichePlaceholder}
              />
            </div>
            <div>
              <label className="label">{t.carousels.audience}</label>
              <input
                className="input"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder={t.carousels.audiencePlaceholder}
              />
            </div>
            <div>
              <label className="label">{t.carousels.product}</label>
              <input
                className="input"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder={t.carousels.productPlaceholder}
              />
            </div>
            <div>
              <label className="label">{t.carousels.seriesHint}</label>
              <input
                className="input"
                value={seriesHint}
                onChange={(e) => setSeriesHint(e.target.value)}
                placeholder={t.carousels.seriesHintPlaceholder}
              />
            </div>
            <div>
              <label className="label">{t.carousels.blueprint}</label>
              <select
                className="select"
                value={blueprintId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBlueprintId(id);
                  const bp = blueprints.find((b) => b.id === id);
                  if (bp?.defaults?.slideCount) {
                    setSlideCount(bp.defaults.slideCount);
                  }
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
                {t.carousels.blueprintHint}
              </div>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="label">{t.carousels.slideCount}</label>
                <select
                  className="select"
                  value={slideCount}
                  onChange={(e) => setSlideCount(Number(e.target.value))}
                >
                  {[4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">{t.carousels.packCount}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={packCount}
                  onChange={(e) => setPackCount(Number(e.target.value) || 1)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">{t.carousels.language}</label>
                <select
                  className="select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "ua")}
                >
                  <option value="en">EN</option>
                  <option value="ua">UA</option>
                </select>
              </div>
            </div>
            {message ? (
              <p
                className="muted"
                role="alert"
                style={{ margin: 0, color: "var(--danger, #b91c1c)" }}
              >
                {message}
              </p>
            ) : null}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowGenerate(false)}
              >
                {t.cancel}
              </button>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? t.carousels.generating : t.carousels.submitGenerate}
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
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => !loading && setEditing(null)}
        >
          <div
            className="card stack"
            style={{
              width: "min(640px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0 }}>{t.edit}</h2>
            <div>
              <label className="label">{t.carousels.hook}</label>
              <input
                className="input"
                value={editing.hook}
                onChange={(e) =>
                  setEditing({ ...editing, hook: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">{t.carousels.caption}</label>
              <textarea
                className="textarea"
                value={editing.caption}
                onChange={(e) =>
                  setEditing({ ...editing, caption: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">{t.carousels.slides}</label>
              <div className="stack" style={{ gap: "0.75rem" }}>
                {editing.slides.map((s, idx) => (
                  <div
                    key={idx}
                    className="card"
                    style={{ margin: 0, background: "var(--bg)" }}
                  >
                    <div className="muted" style={{ marginBottom: 6 }}>
                      #{idx + 1}
                    </div>
                    <label className="label">{t.carousels.headline}</label>
                    <input
                      className="input"
                      value={s.headline}
                      onChange={(e) => {
                        const slides = [...editing.slides];
                        slides[idx] = { ...s, headline: e.target.value };
                        setEditing({ ...editing, slides });
                      }}
                    />
                    <label className="label">{t.carousels.body}</label>
                    <textarea
                      className="textarea"
                      value={s.body ?? ""}
                      onChange={(e) => {
                        const slides = [...editing.slides];
                        slides[idx] = { ...s, body: e.target.value };
                        setEditing({ ...editing, slides });
                      }}
                    />
                    <label className="label">{t.carousels.imagePrompt}</label>
                    <textarea
                      className="textarea"
                      value={s.imagePrompt}
                      onChange={(e) => {
                        const slides = [...editing.slides];
                        slides[idx] = { ...s, imagePrompt: e.target.value };
                        setEditing({ ...editing, slides });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                {t.cancel}
              </button>
              <button
                className="btn"
                type="button"
                disabled={loading}
                onClick={() => saveDraft(editing)}
              >
                {t.carousels.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.carousels.fullPreview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => setLightbox(null)}
        >
          <div
            className="stack"
            style={{
              width: "min(520px, 100%)",
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
              <span className="muted">
                {tf(t.carousels.previewSlide, {
                  n: lightbox.index + 1,
                  total: lightbox.urls.length,
                })}
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setLightbox(null)}
              >
                {t.cancel}
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.urls[lightbox.index]}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "78vh",
                width: "auto",
                height: "auto",
                borderRadius: 12,
                border: "1px solid var(--border)",
                objectFit: "contain",
                background: "#000",
              }}
            />
            {lightbox.urls.length > 1 ? (
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    setLightbox((prev) =>
                      prev
                        ? {
                            ...prev,
                            index:
                              (prev.index - 1 + prev.urls.length) %
                              prev.urls.length,
                          }
                        : prev,
                    )
                  }
                >
                  {t.carousels.prevSlide}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    setLightbox((prev) =>
                      prev
                        ? {
                            ...prev,
                            index: (prev.index + 1) % prev.urls.length,
                          }
                        : prev,
                    )
                  }
                >
                  {t.carousels.nextSlide}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
