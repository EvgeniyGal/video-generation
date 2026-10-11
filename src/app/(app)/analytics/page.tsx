"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

type Metric = { type: string; name: string; value: number; unit: string };

type Row = {
  post: {
    id: string;
    text: string;
    status: string;
    bufferPostId: string | null;
    createdAt: string;
  };
  channel?: { service: string | null; displayName: string | null };
  accountLabel: string | null;
  latestMetrics: {
    metrics: Metric[];
    metricsUpdatedAt: string | null;
    capturedAt: string;
  } | null;
};

export default function AnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/analytics");
    const data = await res.json();
    setRows(data.rows ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncNow() {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/jobs/sync-metrics", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Sync failed");
      return;
    }
    setMessage(
      `Synced ${data.synced}/${data.total} (errors: ${data.errors ?? 0})`,
    );
    await load();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Analytics</h1>
          <p className="muted">
            Buffer metrics refresh ~daily. A cron job syncs at 06:00 UTC; you can
            also pull now.
          </p>
        </div>
        <button className="btn" onClick={syncNow} disabled={loading}>
          {loading ? "Syncing…" : "Sync metrics now"}
        </button>
      </div>
      {message ? <div className="muted">{message}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Metrics</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.post.id}>
                <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>
                  {row.post.text.slice(0, 140)}
                  {row.post.text.length > 140 ? "…" : ""}
                  <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>
                    {row.post.bufferPostId}
                  </div>
                </td>
                <td>
                  <div>{row.accountLabel}</div>
                  <div className="muted">
                    {row.channel?.service} · {row.channel?.displayName}
                  </div>
                </td>
                <td>
                  <StatusBadge status={row.post.status} />
                </td>
                <td>
                  {row.latestMetrics?.metrics?.length ? (
                    <div className="stack" style={{ gap: 4 }}>
                      {row.latestMetrics.metrics.map((m) => (
                        <div key={m.type} style={{ fontSize: "0.9rem" }}>
                          <span className="muted">{m.name}:</span>{" "}
                          <strong>
                            {m.unit === "percentage"
                              ? `${m.value.toFixed(1)}%`
                              : Math.round(m.value).toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">No metrics yet</span>
                  )}
                </td>
                <td className="muted">
                  {row.latestMetrics?.metricsUpdatedAt
                    ? new Date(row.latestMetrics.metricsUpdatedAt).toLocaleString()
                    : row.latestMetrics?.capturedAt
                      ? new Date(row.latestMetrics.capturedAt).toLocaleString()
                      : "—"}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  No scheduled posts yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
