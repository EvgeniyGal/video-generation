"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

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
    setMessage("Draft saved");
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
      `Started ${data.videos?.length ?? 0} generation(s)` +
        (data.errors?.length ? `, ${data.errors.length} error(s)` : ""),
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

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>Drafts</h1>
        <p className="muted">
          Review AI-prepared content, pick a voice, then generate videos on demand.
        </p>
      </div>

      <div className="row">
        <button
          className="btn btn-secondary"
          disabled={!selected.size || loading}
          onClick={approveSelected}
        >
          Approve selected
        </button>
        <button
          className="btn"
          disabled={!selected.size || loading}
          onClick={generateSelected}
        >
          Generate videos ({selected.size})
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Hook / Script</th>
              <th>Caption</th>
              <th>Status</th>
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
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!drafts.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  No drafts yet. Prepare content from Ideas.
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
          <div className="card stack" style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
            <h2 style={{ margin: 0 }}>Edit draft</h2>
            {(
              [
                ["hook", "Hook"],
                ["script", "Script"],
                ["caption", "Caption"],
                ["cta", "CTA"],
                ["visualStyle", "Visual style"],
              ] as const
            ).map(([key, label]) => (
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
              <label className="label">Hashtags (comma-separated)</label>
              <input
                className="input"
                value={(editing.hashtags ?? []).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    hashtags: e.target.value
                      .split(",")
                      .map((t) => t.trim().replace(/^#/, ""))
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Voice</label>
              <select
                className="select"
                value={editing.voiceId ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, voiceId: e.target.value || null })
                }
              >
                <option value="">HeyGen default / auto</option>
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
              <label className="label">Avatar ID (optional)</label>
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
                Save
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
