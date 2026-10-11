"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Settings = {
  openaiConfigured: boolean;
  heygenConfigured: boolean;
  brandTone: string;
  globalStyle: string;
  openaiModel: string;
  bufferAccounts: Array<{
    id: string;
    label: string;
    organizationName: string | null;
    channelCount: number;
  }>;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [heygenApiKey, setHeygenApiKey] = useState("");
  const [brandTone, setBrandTone] = useState("");
  const [globalStyle, setGlobalStyle] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4.1-mini");
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [bufferLabel, setBufferLabel] = useState("");
  const [bufferApiKey, setBufferApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/openai/models");
      const data = await res.json();
      if (!res.ok) {
        setOpenaiModels([]);
        setModelsError(data.error || "Failed to load models");
        return;
      }
      const models: string[] = data.models ?? [];
      setOpenaiModels(models);
      setOpenaiModel((current) => {
        if (current && models.includes(current)) return current;
        if (models.includes("gpt-4.1-mini")) return "gpt-4.1-mini";
        return models[0] ?? current;
      });
    } catch (err) {
      setOpenaiModels([]);
      setModelsError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setBrandTone(data.brandTone ?? "");
    setGlobalStyle(data.globalStyle ?? "");
    setOpenaiModel(data.openaiModel ?? "gpt-4.1-mini");
    if (data.openaiConfigured) {
      // refresh model list after settings load
      void loadModels();
    } else {
      setOpenaiModels([]);
      setModelsError(null);
    }
  }, [loadModels]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveKeys(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openaiApiKey: openaiApiKey || undefined,
        heygenApiKey: heygenApiKey || undefined,
        brandTone,
        globalStyle,
        openaiModel,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error || "Save failed");
      return;
    }
    setOpenaiApiKey("");
    setHeygenApiKey("");
    setMessage("Settings saved");
    await load();
  }

  async function addBuffer(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/buffer/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: bufferLabel, apiKey: bufferApiKey }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Failed to connect Buffer");
      return;
    }
    setBufferLabel("");
    setBufferApiKey("");
    setMessage(
      `Connected ${data.account.label} with ${data.channels?.length ?? 0} channel(s)`,
    );
    await load();
  }

  async function syncAccount(accountId: string) {
    setLoading(true);
    const res = await fetch("/api/buffer/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    const data = await res.json();
    setLoading(false);
    setMessage(
      res.ok
        ? `Synced ${data.channels?.length ?? 0} channels`
        : data.error || "Sync failed",
    );
    await load();
  }

  async function removeAccount(id: string) {
    if (!confirm("Remove this Buffer account?")) return;
    await fetch(`/api/buffer/accounts?id=${id}`, { method: "DELETE" });
    await load();
  }

  if (!settings) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <p className="muted">
          Manage API keys (encrypted at rest) and Buffer accounts. Free Buffer
          accounts support ~3 channels each — connect multiple accounts as needed.
        </p>
      </div>

      {message ? <div className="card muted">{message}</div> : null}

      <form className="card stack" onSubmit={saveKeys}>
        <h2 style={{ margin: 0 }}>Integrations & content defaults</h2>
        <div>
          <label className="label">
            OpenAI API key{" "}
            {settings.openaiConfigured ? "(configured)" : "(not set)"}
          </label>
          <input
            className="input"
            type="password"
            placeholder={settings.openaiConfigured ? "•••• leave blank to keep" : "sk-..."}
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            HeyGen API key{" "}
            {settings.heygenConfigured ? "(configured)" : "(not set)"}
          </label>
          <input
            className="input"
            type="password"
            placeholder={settings.heygenConfigured ? "•••• leave blank to keep" : "hg-..."}
            value={heygenApiKey}
            onChange={(e) => setHeygenApiKey(e.target.value)}
          />
        </div>
        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <label className="label" style={{ margin: 0 }}>
              OpenAI model
            </label>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={modelsLoading || (!settings.openaiConfigured && !openaiApiKey)}
              onClick={async () => {
                // If user typed a new key but hasn't saved yet, save it first so refresh works.
                if (openaiApiKey.trim()) {
                  setLoading(true);
                  const res = await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ openaiApiKey }),
                  });
                  setLoading(false);
                  if (!res.ok) {
                    const data = await res.json();
                    setModelsError(data.error || "Could not save API key");
                    return;
                  }
                  setOpenaiApiKey("");
                  await load();
                  return;
                }
                await loadModels();
              }}
            >
              {modelsLoading ? "Refreshing…" : "Refresh models"}
            </button>
          </div>
          <select
            className="select"
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
            disabled={!openaiModels.length && !openaiModel}
          >
            {!openaiModels.length ? (
              <option value={openaiModel || ""}>
                {openaiModel || "Save an OpenAI key, then refresh"}
              </option>
            ) : null}
            {openaiModels.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {modelsError ? (
            <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 6 }}>
              {modelsError}
            </div>
          ) : openaiModels.length ? (
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
              {openaiModels.length} models available
            </div>
          ) : (
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
              Configure an OpenAI API key, then click Refresh models.
            </div>
          )}
        </div>
        <div>
          <label className="label">Brand / tone</label>
          <textarea
            className="textarea"
            value={brandTone}
            onChange={(e) => setBrandTone(e.target.value)}
            placeholder="Direct, practical, no fluff…"
          />
        </div>
        <div>
          <label className="label">Global visual style for reels</label>
          <textarea
            className="textarea"
            value={globalStyle}
            onChange={(e) => setGlobalStyle(e.target.value)}
            placeholder="Talking-head avatar, bold captions, fast cuts…"
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          Save settings
        </button>
      </form>

      <form className="card stack" onSubmit={addBuffer}>
        <h2 style={{ margin: 0 }}>Add Buffer account</h2>
        <p className="muted" style={{ margin: 0 }}>
          Use a Buffer personal API key (Settings → API). Personal keys are required
          for post metrics.
        </p>
        <div>
          <label className="label">Label</label>
          <input
            className="input"
            required
            value={bufferLabel}
            onChange={(e) => setBufferLabel(e.target.value)}
            placeholder="Brand A / Personal IG"
          />
        </div>
        <div>
          <label className="label">Personal API key</label>
          <input
            className="input"
            type="password"
            required
            value={bufferApiKey}
            onChange={(e) => setBufferApiKey(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          Connect & sync channels
        </button>
      </form>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Connected Buffer accounts</h2>
        {settings.bufferAccounts.map((account) => (
          <div
            key={account.id}
            className="row"
            style={{
              justifyContent: "space-between",
              borderTop: "1px solid var(--border)",
              paddingTop: "0.75rem",
            }}
          >
            <div>
              <strong>{account.label}</strong>
              <div className="muted">
                {account.organizationName || "Organization"} ·{" "}
                {account.channelCount} channel(s)
              </div>
            </div>
            <div className="row">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => syncAccount(account.id)}
                disabled={loading}
              >
                Refresh channels
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => removeAccount(account.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {!settings.bufferAccounts.length ? (
          <p className="muted">No Buffer accounts connected.</p>
        ) : null}
      </div>
    </div>
  );
}
