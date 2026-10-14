"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { useLocale } from "@/i18n/LocaleProvider";

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
  mediaKind?: "video" | "carousel" | "unknown";
  title?: string | null;
  latestMetrics: {
    metrics: Metric[];
    metricsUpdatedAt: string | null;
    capturedAt: string;
  } | null;
};

export default function AnalyticsPage() {
  const { t, tf } = useLocale();
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
      tf(t.analytics.synced, {
        synced: data.synced,
        total: data.total,
        errors: data.errors ?? 0,
      }),
    );
    await load();
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>{t.analytics.title}</h1>
          <p className="muted">{t.analytics.subtitle}</p>
        </div>
        <button className="btn" onClick={syncNow} disabled={loading}>
          {loading ? t.analytics.syncing : t.analytics.sync}
        </button>
      </div>
      {message ? <div className="muted">{message}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t.analytics.post}</th>
              <th>{t.analytics.channel}</th>
              <th>{t.status}</th>
              <th>{t.analytics.metrics}</th>
              <th>{t.analytics.updated}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.post.id}>
                <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>
                  {row.title ? (
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {row.title}
                    </div>
                  ) : null}
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {row.mediaKind === "carousel"
                      ? t.nav.carousels
                      : row.mediaKind === "video"
                        ? t.nav.videos
                        : null}
                  </div>
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
                    <span className="muted">{t.analytics.noMetrics}</span>
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
                  {t.analytics.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
