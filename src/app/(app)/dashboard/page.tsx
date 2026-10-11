"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import { useLocale } from "@/i18n/LocaleProvider";

type Stats = {
  ideas: number;
  drafts: Record<string, number>;
  videos: Record<string, number>;
  posts: number;
};

export default function DashboardPage() {
  const { t } = useLocale();
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
        <h1 style={{ margin: 0 }}>{t.dashboard.title}</h1>
        <p className="muted">{t.dashboard.subtitle}</p>
      </div>

      {error ? (
        <div className="card" style={{ color: "var(--danger)" }}>
          {error}
          <div className="muted" style={{ marginTop: 8 }}>
            {t.dashboard.dbHint}
          </div>
        </div>
      ) : !stats ? (
        <p className="muted">{t.loading}</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
          }}
        >
          <StatCard label={t.dashboard.ideas} value={stats.ideas} href="/ideas" />
          <StatCard label={t.dashboard.drafts} value={stats.drafts.total} href="/drafts" />
          <StatCard
            label={t.dashboard.generating}
            value={(stats.drafts.generating ?? 0) + (stats.videos.generating ?? 0)}
            href="/videos"
          />
          <StatCard
            label={t.dashboard.readyVideos}
            value={stats.videos.ready ?? 0}
            href="/videos"
          />
          <StatCard
            label={t.dashboard.scheduledPosts}
            value={stats.posts}
            href="/schedule"
          />
          <StatCard
            label={t.dashboard.failedDrafts}
            value={stats.drafts.failed ?? 0}
            href="/drafts"
          />
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t.dashboard.workflow}</h2>
        <ol className="muted" style={{ lineHeight: 1.7 }}>
          <li>{t.dashboard.step1}</li>
          <li>{t.dashboard.step2}</li>
          <li>{t.dashboard.step3}</li>
          <li>{t.dashboard.step4}</li>
          <li>{t.dashboard.step5}</li>
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
