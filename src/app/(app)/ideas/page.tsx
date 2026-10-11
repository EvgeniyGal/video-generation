"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Idea = {
  id: string;
  title: string | null;
  content: string;
  status: string;
  createdAt: string;
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/ideas");
    const data = await res.json();
    setIdeas(data.ideas ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addIdeas(e: FormEvent) {
    e.preventDefault();
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideas: lines }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error || "Failed");
      return;
    }
    setBulkText("");
    setMessage(`Added ${lines.length} idea(s)`);
    await load();
  }

  async function prepareSelected() {
    if (!selected.size) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaIds: [...selected] }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Prepare failed");
      return;
    }
    setMessage(
      `Prepared ${data.drafts?.length ?? 0} draft(s)` +
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
        <h1 style={{ margin: 0 }}>Ideas</h1>
        <p className="muted">
          Capture reel ideas. Preparing content uses OpenAI only — videos are never
          generated automatically.
        </p>
      </div>

      <form className="card stack" onSubmit={addIdeas}>
        <div>
          <label className="label">Add ideas (one per line)</label>
          <textarea
            className="textarea"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Why cold emails fail in 2026&#10;3 lessons from shipping weekly"
          />
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={loading}>
            Add ideas
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={loading || !selected.size}
            onClick={prepareSelected}
          >
            Prepare content ({selected.size})
          </button>
        </div>
        {message ? <div className="muted">{message}</div> : null}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Idea</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => (
              <tr key={idea.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(idea.id)}
                    onChange={() => toggle(idea.id)}
                  />
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{idea.title}</div>
                  <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                    {idea.content}
                  </div>
                </td>
                <td>{idea.status}</td>
                <td className="muted">
                  {new Date(idea.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!ideas.length ? (
              <tr>
                <td colSpan={4} className="muted">
                  No ideas yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
