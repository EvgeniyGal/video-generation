"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import { useLocale } from "@/i18n/LocaleProvider";

type ServiceBalance = {
  id: "openai" | "heygen" | "elevenlabs" | "buffer";
  configured: boolean;
  ok: boolean;
  remainingLabel: string | null;
  detail?: string | null;
  error?: string | null;
};

type Stats = {
  ideas: number;
  drafts: Record<string, number>;
  videos: Record<string, number>;
  posts: number;
  services?: ServiceBalance[];
};

const SERVICE_ORDER = ["heygen", "elevenlabs", "openai", "buffer"] as const;

export default function DashboardPage() {
  const { t, tf } = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<Stats>("/api/dashboard")
      .then(setStats)
      .catch((err: Error) => setError(err.message));
  }, []);

  const serviceName = (id: ServiceBalance["id"]) => {
    switch (id) {
      case "openai":
        return t.dashboard.serviceOpenAI;
      case "heygen":
        return t.dashboard.serviceHeyGen;
      case "elevenlabs":
        return t.dashboard.serviceElevenLabs;
      case "buffer":
        return t.dashboard.serviceBuffer;
    }
  };

  const services = [...(stats?.services ?? [])].sort(
    (a, b) => SERVICE_ORDER.indexOf(a.id) - SERVICE_ORDER.indexOf(b.id),
  );

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
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1rem",
            }}
          >
            <StatCard
              label={t.dashboard.drafts}
              value={stats.drafts.total}
              href="/drafts"
            />
            <StatCard
              label={t.dashboard.generating}
              value={
                (stats.drafts.generating ?? 0) + (stats.videos.generating ?? 0)
              }
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

          <div className="card stack">
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>{t.dashboard.creditsTitle}</h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {t.dashboard.creditsSubtitle}
                </p>
              </div>
              <Link href="/settings" className="muted" style={{ fontSize: "0.9rem" }}>
                {t.dashboard.creditsSettings}
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {services.map((s) => {
                const main =
                  s.id === "openai" && s.configured
                    ? t.dashboard.openaiUsageBased
                    : s.id === "buffer"
                      ? tf(t.dashboard.bufferAccounts, {
                          count: Number(s.remainingLabel || 0),
                        })
                      : s.remainingLabel ||
                        (s.configured
                          ? t.dashboard.creditsNone
                          : t.dashboard.creditsNone);
                const detail =
                  s.id === "openai" && s.configured
                    ? t.dashboard.openaiUsageHint
                    : s.id === "buffer"
                      ? tf(t.dashboard.bufferChannels, {
                          count: Number(s.detail || 0),
                        })
                      : s.detail;
                return (
                  <div
                    key={s.id}
                    className="card"
                    style={{
                      margin: 0,
                      background: "var(--bg)",
                      borderColor:
                        s.configured && !s.ok
                          ? "color-mix(in srgb, var(--danger) 45%, var(--border))"
                          : "var(--border)",
                    }}
                  >
                    <div
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <strong>{serviceName(s.id)}</strong>
                      <span
                        className={
                          !s.configured
                            ? "badge"
                            : s.ok
                              ? "badge badge-success"
                              : "badge badge-danger"
                        }
                      >
                        {!s.configured
                          ? t.dashboard.creditsMissing
                          : s.ok
                            ? t.dashboard.creditsOk
                            : t.dashboard.creditsError}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 650,
                        marginTop: 10,
                        lineHeight: 1.3,
                      }}
                    >
                      {main}
                    </div>
                    {detail ? (
                      <div
                        className="muted"
                        style={{ fontSize: "0.85rem", marginTop: 6 }}
                      >
                        {detail}
                      </div>
                    ) : null}
                    {s.error && s.configured ? (
                      <div
                        style={{
                          color: "var(--danger)",
                          fontSize: "0.8rem",
                          marginTop: 6,
                        }}
                      >
                        {s.error}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
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
      <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
    </Link>
  );
}
