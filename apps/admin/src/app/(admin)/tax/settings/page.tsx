"use client";

import { useCallback, useEffect, useState } from "react";

type TaxSettings = {
  taxMode: "INCLUSIVE" | "EXCLUSIVE";
  autoApplyCanada: boolean;
  applyToPlatformFee: boolean;
};

export default function TaxSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<TaxSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/tax/settings", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load tax settings"));
        return;
      }
      setSettings((json.data?.settings ?? null) as TaxSettings | null);
    } catch {
      setError("Failed to load tax settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(next: Partial<TaxSettings>) {
    if (!settings) return;
    await fetch("/api/admin/v4/tax/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Tax Settings</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>Configure platform-wide tax mode and toggles.</p>

      {loading ? <div style={{ marginTop: 12 }}>Loading settings...</div> : null}
      {error ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && !settings ? <div style={{ marginTop: 12 }}>No settings found.</div> : null}

      {!loading && !error && settings ? (
        <div style={{ marginTop: 12, border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 12, background: "rgba(2,6,23,0.3)", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Tax Mode</div>
            <select
              value={settings.taxMode}
              onChange={(e) => void patch({ taxMode: e.target.value as TaxSettings["taxMode"] })}
              style={inputStyle}
            >
              <option value="EXCLUSIVE">EXCLUSIVE</option>
              <option value="INCLUSIVE">INCLUSIVE</option>
            </select>
          </div>

          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={settings.autoApplyCanada}
              onChange={(e) => void patch({ autoApplyCanada: e.target.checked })}
            />
            Auto apply tax for Canada
          </label>

          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={settings.applyToPlatformFee}
              onChange={(e) => void patch({ applyToPlatformFee: e.target.checked })}
            />
            Apply tax to platform fee
          </label>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: 6,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "rgba(226,232,240,0.92)",
  fontWeight: 800,
  fontSize: 14,
};
