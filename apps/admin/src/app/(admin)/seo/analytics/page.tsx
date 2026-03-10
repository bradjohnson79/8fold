"use client";

import { useCallback, useEffect, useState } from "react";

type Analytics = {
  jobsCreatedToday: number;
  contractorsActive: number;
  indexingPingsToday: number;
  indexingErrors7d: number;
  integrations: {
    ga4Configured: boolean;
    metaPixelConfigured: boolean;
    indexNowConfigured: boolean;
    googleIndexingConfigured: boolean;
  };
};

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 16, padding: 20, background: "var(--card-bg)" };
const statCard: React.CSSProperties = { ...card, textAlign: "center" as const };

function IntegrationBadge({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: configured ? "rgba(34,197,94,0.8)" : "rgba(148,163,184,0.4)", flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: configured ? "rgba(134,239,172,0.8)" : "rgba(148,163,184,0.6)" }}>
        {configured ? "Configured" : "Not Configured"}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analytics | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/analytics", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) { setError("Failed to load analytics"); return; }
      setData(json.data?.analytics ?? null);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Analytics</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Centralized traffic and conversion overview. Configure GA4 and Meta Pixel IDs in the SEO Engine.
      </p>

      {loading && <div style={{ marginTop: 14, color: "var(--muted)" }}>Loading analytics…</div>}
      {error && <div style={{ marginTop: 14, color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>{error}</div>}

      {!loading && !error && data && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
            <div style={statCard}>
              <div style={{ fontSize: 36, fontWeight: 950 }}>{data.jobsCreatedToday}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Jobs Posted Today</div>
            </div>
            <div style={statCard}>
              <div style={{ fontSize: 36, fontWeight: 950 }}>{data.contractorsActive}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Active Contractors</div>
            </div>
            <div style={statCard}>
              <div style={{ fontSize: 36, fontWeight: 950 }}>{data.indexingPingsToday}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Index Pings Today</div>
            </div>
            <div style={statCard}>
              <div style={{ fontSize: 36, fontWeight: 950, color: data.indexingErrors7d > 0 ? "rgba(254,202,202,0.9)" : "inherit" }}>{data.indexingErrors7d}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Indexing Errors (7d)</div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Integration Status</div>
            <IntegrationBadge label="Google Analytics 4 (GA4)" configured={data.integrations.ga4Configured} />
            <IntegrationBadge label="Meta Pixel" configured={data.integrations.metaPixelConfigured} />
            <IntegrationBadge label="IndexNow" configured={data.integrations.indexNowConfigured} />
            <IntegrationBadge label="Google Indexing API" configured={data.integrations.googleIndexingConfigured} />
            <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
              Configure API keys in <a href="/seo/engine" style={{ color: "rgba(34,197,94,0.8)" }}>SEO Engine → Tracking & Indexing Keys</a>
            </div>
          </div>

          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>GA4 & Meta Pixel Injection</div>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
              Once GA4 Measurement ID and Meta Pixel ID are saved in the SEO Engine, inject the tracking scripts into your web app's <code>_document.tsx</code> or root layout by reading the config from <code>/api/admin/v4/seo/settings</code>. The admin configures the IDs; the web app handles script injection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
