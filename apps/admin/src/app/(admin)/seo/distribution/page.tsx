"use client";

import { useCallback, useEffect, useState } from "react";

type DistributionConfig = {
  facebook: boolean;
  linkedin: boolean;
  reddit: boolean;
  twitter: boolean;
};

const PLATFORMS: { key: keyof DistributionConfig; label: string; description: string }[] = [
  { key: "facebook", label: "Facebook", description: "Auto-share new job posts and city pages to a connected Facebook Page." },
  { key: "linkedin", label: "LinkedIn", description: "Cross-post to LinkedIn company page when new content is generated." },
  { key: "reddit", label: "Reddit", description: "Post relevant content to subreddits (r/hiring, regional trade subreddits)." },
  { key: "twitter", label: "Twitter / X", description: "Tweet new job listings and local SEO page launches automatically." },
];

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 16, padding: 20, background: "var(--card-bg)", marginBottom: 16 };
const btn: React.CSSProperties = { padding: "10px 20px", borderRadius: 10, border: "none", background: "rgba(34,197,94,0.16)", color: "rgba(34,197,94,1)", fontWeight: 900, cursor: "pointer", fontSize: 14 };

export default function DistributionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<DistributionConfig>({ facebook: false, linkedin: false, reddit: false, twitter: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/v4/seo/distribution", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (json?.ok) setConfig(json.data?.distribution ?? { facebook: false, linkedin: false, reddit: false, twitter: false });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (key: keyof DistributionConfig) =>
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/distribution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) { setError(json?.error?.message ?? "Save failed"); }
      else { setSuccess("Distribution settings saved"); }
    } catch { setError("Request failed"); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Distribution Engine</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Auto-distribute new content to social platforms when jobs are posted or Local SEO pages are generated. Toggle platforms below.
      </p>

      <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "rgba(251,191,36,0.9)", fontSize: 13 }}>Note: Platform APIs are stubs pending credential configuration</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Toggle distribution targets here. Wire up API credentials per platform to activate posting.</div>
      </div>

      {loading && <div style={{ color: "var(--muted)" }}>Loading distribution config…</div>}
      {error && <div style={{ color: "rgba(254,202,202,0.95)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}
      {success && <div style={{ color: "rgba(134,239,172,0.95)", marginBottom: 12, fontWeight: 700 }}>{success}</div>}

      {!loading && PLATFORMS.map((p) => (
        <div key={p.key} style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{p.label}</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{p.description}</div>
          </div>
          <button
            onClick={() => toggle(p.key)}
            style={{
              padding: "8px 20px",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: config[p.key] ? "rgba(34,197,94,0.18)" : "var(--input-bg)",
              color: config[p.key] ? "rgba(34,197,94,1)" : "var(--muted)",
              fontWeight: 900,
              cursor: "pointer",
              fontSize: 13,
              minWidth: 80,
            }}
          >
            {config[p.key] ? "Enabled" : "Disabled"}
          </button>
        </div>
      ))}

      {!loading && (
        <button style={btn} onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save Distribution Settings"}
        </button>
      )}
    </div>
  );
}
