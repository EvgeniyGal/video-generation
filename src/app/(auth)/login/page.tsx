"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/messages";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale, locales } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t.login.invalid);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
    >
      <form className="card stack" style={{ width: "100%", maxWidth: 400 }} onSubmit={onSubmit}>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <div
            role="group"
            aria-label={t.language}
            style={{ display: "flex", gap: 6 }}
          >
            {locales.map((item) => {
              const active = locale === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  className={active ? "btn" : "btn btn-secondary"}
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                  onClick={() => setLocale(item.code as Locale)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <h1 style={{ margin: 0 }}>{t.login.title}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t.login.subtitle}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="email">
            {t.login.email}
          </label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t.login.password}
          </label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            required
          />
        </div>
        {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? t.login.submitting : t.login.submit}
        </button>
      </form>
    </div>
  );
}
