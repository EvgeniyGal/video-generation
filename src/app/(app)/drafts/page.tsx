"use client";

import { useCallback, useEffect, useState } from "react";
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
};

type Voice = {
  voice_id: string;
  name?: string;
  language?: string;
  gender?: string;
};

export default function DraftsPage() {
  const { t, tf } = useLocale();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          ? tf(t.ideas.errors, { count: data.errors.length })
          : ""),
    );
    setSelected(new Set());
    await load();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fieldLabels = [
    ["hook", t.drafts.hook],
    ["script", t.drafts.script],
    ["caption", t.drafts.caption],
    ["cta", t.drafts.cta],
    ["visualStyle", t.drafts.visualStyle],
  ] as const;

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>{t.drafts.title}</h1>
        <p className="muted">{t.drafts.subtitle}</p>
      </div>

      <div className="row">
        <button
          className="btn btn-secondary"
          disabled={!selected.size || loading}
          onClick={approveSelected}
        >
          {t.drafts.approve}
        </button>
        <button
          className="btn"
          disabled={!selected.size || loading}
          onClick={generateSelected}
        >
          {t.drafts.generate} ({selected.size})
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>{t.drafts.hookScript}</th>
              <th>{t.drafts.caption}</th>
              <th>{t.status}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr key={draft.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(draft.id)}
                    onChange={() => toggle(draft.id)}
                    disabled={["generating", "ready", "scheduled", "posted"].includes(
                      draft.status,
                    )}
                  />
                </td>
                <td style={{ maxWidth: 320 }}>
                  <strong>{draft.hook}</strong>
                  <div className="muted" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                    {draft.script.slice(0, 220)}
                    {draft.script.length > 220 ? "…" : ""}
                  </div>
                </td>
                <td style={{ maxWidth: 240 }}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{draft.caption}</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {(draft.hashtags ?? []).map((h) => `#${h}`).join(" ")}
                  </div>
                </td>
                <td>
                  <StatusBadge status={draft.status} />
                  {draft.errorMessage ? (
                    <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: 6 }}>
                      {draft.errorMessage}
                    </div>
                  ) : null}
                </td>
                <td>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditing(draft)}
                  >
                    {t.edit}
                  </button>
                </td>
              </tr>
            ))}
            {!drafts.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  {t.drafts.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
            style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto" }}
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
