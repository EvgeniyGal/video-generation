"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { reportFormValidity } from "@/lib/form-focus";
import { useLocale } from "@/i18n/LocaleProvider";

type Settings = {
  openaiConfigured: boolean;
  heygenConfigured: boolean;
  elevenlabsConfigured: boolean;
  pixabayConfigured: boolean;
  pexelsConfigured: boolean;
  openaiModel: string;
  openaiImageModel: string;
  bufferAccounts: Array<{
    id: string;
    label: string;
    organizationName: string | null;
    channelCount: number;
  }>;
};

export default function SettingsPage() {
  const { t, tf } = useLocale();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [heygenApiKey, setHeygenApiKey] = useState("");
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState("");
  const [pixabayApiKey, setPixabayApiKey] = useState("");
  const [pexelsApiKey, setPexelsApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4.1-mini");
  const [openaiImageModel, setOpenaiImageModel] = useState(
    "gpt-image-2.5-flare",
  );
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [imageModelsLoading, setImageModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [imageModelsError, setImageModelsError] = useState<string | null>(null);
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

  const loadImageModels = useCallback(async () => {
    setImageModelsLoading(true);
    setImageModelsError(null);
    try {
      const res = await fetch("/api/openai/models?kind=image");
      const data = await res.json();
      if (!res.ok) {
        setImageModels([]);
        setImageModelsError(data.error || "Failed to load image models");
        return;
      }
      const models: string[] = data.models ?? [];
      setImageModels(models);
      setOpenaiImageModel((current) => {
        if (current && models.includes(current)) return current;
        if (models.includes("gpt-image-2.5-flare")) return "gpt-image-2.5-flare";
        return models[0] ?? current;
      });
    } catch (err) {
      setImageModels([]);
      setImageModelsError(
        err instanceof Error ? err.message : "Failed to load image models",
      );
    } finally {
      setImageModelsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setOpenaiModel(data.openaiModel ?? "gpt-4.1-mini");
    setOpenaiImageModel(data.openaiImageModel ?? "gpt-image-2.5-flare");
    if (data.openaiConfigured) {
      void loadModels();
      void loadImageModels();
    } else {
      setOpenaiModels([]);
      setImageModels([]);
      setModelsError(null);
      setImageModelsError(null);
    }
  }, [loadModels, loadImageModels]);

  useEffect(() => {
    load();
  }, [load]);

  async function ensureOpenaiKeySaved() {
    if (!openaiApiKey.trim()) return true;
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
      return false;
    }
    setOpenaiApiKey("");
    await load();
    return true;
  }

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
        elevenlabsApiKey: elevenlabsApiKey || undefined,
        pixabayApiKey: pixabayApiKey || undefined,
        pexelsApiKey: pexelsApiKey || undefined,
        openaiModel,
        openaiImageModel,
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
    setElevenlabsApiKey("");
    setPixabayApiKey("");
    setPexelsApiKey("");
    setMessage(t.settings.saved);
    await load();
  }

  async function addBuffer(e: FormEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    if (!reportFormValidity(formEl)) {
      setMessage(t.fieldRequired);
      return;
    }
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
      tf(t.settings.connectedMsg, {
        label: data.account.label,
        count: data.channels?.length ?? 0,
      }),
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
        ? tf(t.settings.syncedChannels, { count: data.channels?.length ?? 0 })
        : data.error || "Sync failed",
    );
    await load();
  }

  async function removeAccount(id: string) {
    if (!confirm(t.settings.removeConfirm)) return;
    await fetch(`/api/buffer/accounts?id=${id}`, { method: "DELETE" });
    await load();
  }

  if (!settings) return <p className="muted">{t.loading}</p>;

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>{t.settings.title}</h1>
        <p className="muted">{t.settings.subtitle}</p>
      </div>

      {message ? <div className="card muted">{message}</div> : null}

      <form className="card stack" onSubmit={saveKeys}>
        <h2 style={{ margin: 0 }}>{t.settings.integrations}</h2>
        <div>
          <label className="label">
            {t.settings.openaiKey}{" "}
            {settings.openaiConfigured
              ? t.settings.configured
              : t.settings.notSet}
          </label>
          <input
            className="input"
            type="password"
            placeholder={
              settings.openaiConfigured ? t.settings.keepBlank : "sk-..."
            }
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            {t.settings.heygenKey}{" "}
            {settings.heygenConfigured
              ? t.settings.configured
              : t.settings.notSet}
          </label>
          <input
            className="input"
            type="password"
            placeholder={
              settings.heygenConfigured ? t.settings.keepBlank : "hg-..."
            }
            value={heygenApiKey}
            onChange={(e) => setHeygenApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            {t.settings.elevenlabsKey}{" "}
            {settings.elevenlabsConfigured
              ? t.settings.configured
              : t.settings.notSet}
          </label>
          <input
            className="input"
            type="password"
            placeholder={
              settings.elevenlabsConfigured ? t.settings.keepBlank : "xi-..."
            }
            value={elevenlabsApiKey}
            onChange={(e) => setElevenlabsApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            {t.settings.pixabayKey}{" "}
            {settings.pixabayConfigured
              ? t.settings.configured
              : t.settings.notSet}
          </label>
          <input
            className="input"
            type="password"
            placeholder={
              settings.pixabayConfigured ? t.settings.keepBlank : "pixabay-..."
            }
            value={pixabayApiKey}
            onChange={(e) => setPixabayApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            {t.settings.pexelsKey}{" "}
            {settings.pexelsConfigured
              ? t.settings.configured
              : t.settings.notSet}
          </label>
          <input
            className="input"
            type="password"
            placeholder={
              settings.pexelsConfigured ? t.settings.keepBlank : "pexels-..."
            }
            value={pexelsApiKey}
            onChange={(e) => setPexelsApiKey(e.target.value)}
          />
          <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
            {t.settings.stockKeysHint}
          </div>
        </div>
        <div>
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 6 }}
          >
            <label className="label" style={{ margin: 0 }}>
              {t.settings.openaiModel}
            </label>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={
                modelsLoading || (!settings.openaiConfigured && !openaiApiKey)
              }
              onClick={async () => {
                if (!(await ensureOpenaiKeySaved())) return;
                await loadModels();
              }}
            >
              {modelsLoading
                ? t.settings.refreshingModels
                : t.settings.refreshModels}
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
                {openaiModel || t.settings.modelsPlaceholder}
              </option>
            ) : null}
            {openaiModels.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {modelsError ? (
            <div
              style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 6 }}
            >
              {modelsError}
            </div>
          ) : openaiModels.length ? (
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
              {tf(t.settings.modelsAvailable, { count: openaiModels.length })}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
              {t.settings.modelsHint}
            </div>
          )}
        </div>
        <div>
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 6 }}
          >
            <label className="label" style={{ margin: 0 }}>
              {t.settings.openaiImageModel}
            </label>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={
                imageModelsLoading ||
                (!settings.openaiConfigured && !openaiApiKey)
              }
              onClick={async () => {
                if (!(await ensureOpenaiKeySaved())) return;
                await loadImageModels();
              }}
            >
              {imageModelsLoading
                ? t.settings.refreshingModels
                : t.settings.refreshImageModels}
            </button>
          </div>
          <select
            className="select"
            value={openaiImageModel}
            onChange={(e) => setOpenaiImageModel(e.target.value)}
            disabled={!imageModels.length && !openaiImageModel}
          >
            {!imageModels.length ? (
              <option value={openaiImageModel || ""}>
                {openaiImageModel || t.settings.modelsPlaceholder}
              </option>
            ) : null}
            {imageModels.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {imageModelsError ? (
            <div
              style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 6 }}
            >
              {imageModelsError}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
              {t.settings.imageModelsHint}
            </div>
          )}
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {t.settings.saveSettings}
        </button>
      </form>

      <form className="card stack" onSubmit={addBuffer}>
        <h2 style={{ margin: 0 }}>{t.settings.addBuffer}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t.settings.bufferHint}
        </p>
        <div>
          <label className="label" htmlFor="buffer-label">
            {t.settings.label} *
          </label>
          <input
            id="buffer-label"
            className="input"
            required
            value={bufferLabel}
            onChange={(e) => setBufferLabel(e.target.value)}
            placeholder={t.settings.labelPlaceholder}
          />
        </div>
        <div>
          <label className="label" htmlFor="buffer-api-key">
            {t.settings.personalKey} *
          </label>
          <input
            id="buffer-api-key"
            className="input"
            type="password"
            required
            value={bufferApiKey}
            onChange={(e) => setBufferApiKey(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {t.settings.connect}
        </button>
      </form>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>{t.settings.connected}</h2>
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
                {account.organizationName || t.settings.organization} ·{" "}
                {account.channelCount} {t.settings.channels}
              </div>
            </div>
            <div className="row">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => syncAccount(account.id)}
                disabled={loading}
              >
                {t.settings.refreshChannels}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => removeAccount(account.id)}
              >
                {t.remove}
              </button>
            </div>
          </div>
        ))}
        {!settings.bufferAccounts.length ? (
          <p className="muted">{t.settings.noAccounts}</p>
        ) : null}
      </div>
    </div>
  );
}
