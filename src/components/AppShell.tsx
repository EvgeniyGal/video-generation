"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ideas", label: "Ideas" },
  { href: "/drafts", label: "Drafts" },
  { href: "/videos", label: "Videos" },
  { href: "/schedule", label: "Schedule" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
        }}
      >
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Reels Studio</div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Multi-Buffer pipeline
          </div>
        </div>
        <nav className="stack" style={{ gap: "0.35rem" }}>
          {NAV.map((item) => {
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
          style={{ marginTop: "2rem", width: "100%" }}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </aside>
      <main style={{ padding: "1.5rem 2rem", maxWidth: 1200 }}>{children}</main>
    </div>
  );
}
