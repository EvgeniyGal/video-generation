"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/messages";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale, setLocale, locales } = useLocale();

  const nav = [
    { href: "/dashboard", label: t.nav.dashboard },
    { href: "/drafts", label: t.nav.drafts },
    { href: "/templates", label: t.nav.templates },
    { href: "/carousels", label: t.nav.carousels },
    { href: "/videos", label: t.nav.videos },
    { href: "/schedule", label: t.nav.schedule },
    { href: "/analytics", label: t.nav.analytics },
    { href: "/settings", label: t.nav.settings },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        minHeight: "100vh",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg-elevated) 80%, transparent)",
          padding: "1.25rem 1rem",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{t.appName}</div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            {t.appTagline}
          </div>
        </div>

        <nav className="stack" style={{ gap: "0.35rem", flex: 1 }}>
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "0.55rem 0.7rem",
                  borderRadius: 8,
                  background: active ? "var(--accent-soft)" : "transparent",
                  border: active
                    ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--border))"
                    : "1px solid transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          className="btn btn-secondary"
          style={{ marginTop: "1.5rem", width: "100%" }}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          {t.signOut}
        </button>

        <div style={{ marginTop: "0.85rem" }}>
          <div className="label" style={{ marginBottom: 6 }}>
            {t.language}
          </div>
          <div
            role="group"
            aria-label={t.language}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {locales.map((item) => {
              const active = locale === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  className={active ? "btn" : "btn btn-secondary"}
                  style={{
                    padding: "0.4rem 0.5rem",
                    fontSize: "0.85rem",
                    width: "100%",
                  }}
                  aria-pressed={active}
                  onClick={() => setLocale(item.code as Locale)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      <main style={{ padding: "1.5rem 2rem", minWidth: 0 }}>{children}</main>
    </div>
  );
}
