"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";

type Stats = {
  ideas: number;
  drafts: Record<string, number>;
  videos: Record<string, number>;
  posts: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<Stats>("/api/dashboard")
      .then(setStats)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p className="muted">Pipeline overview for reels content and publishing.</p>
      </div>

      {error ? (
        <div className="card" style={{ color: "var(--danger)" }}>
          {error}
          <div className="muted" style={{ marginTop: 8 }}>
            If this mentions CONNECT_TIMEOUT, check that Postgres port 5542 (DIRECT_URL)
            is reachable, then run <code>npm run db:push</code>.
          </div>
        </div>
      ) : !stats ? (
        <p className="muted">Loading…</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
          }}
        >
          <StatCard label="Ideas" value={stats.ideas} href="/ideas" />
          <StatCard label="Drafts" value={stats.drafts.total} href="/drafts" />
          <StatCard
            label="Generating"
            value={(stats.drafts.generating ?? 0) + (stats.videos.generating ?? 0)}
            href="/videos"
          />
          <StatCard label="Ready videos" value={stats.videos.ready ?? 0} href="/videos" />
          <StatCard label="Scheduled posts" value={stats.posts} href="/schedule" />
          <StatCard label="Failed drafts" value={stats.drafts.failed ?? 0} href="/drafts" />
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Workflow</h2>
        <ol className="muted" style={{ lineHeight: 1.7 }}>
          <li>Add reel ideas</li>
          <li>Prepare content with OpenAI (no video yet)</li>
          <li>Approve drafts, pick a voice, generate with HeyGen</li>
          <li>Schedule to a Buffer channel</li>
          <li>Review daily metrics in Analytics</li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="card" style={{ display: "block" }}>
      <div className="muted" style={{ fontSize: "0.85rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: 4 }}>{value}</div>
    </Link>
  );
}
