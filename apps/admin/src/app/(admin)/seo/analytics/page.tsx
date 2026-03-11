"use client";

import { useCallback, useEffect, useState } from "react";

type Analytics = {
  jobsCreatedToday: number;
  contractorsActive: number;
  indexingPingsToday: number;
  indexingErrors7d: number;
  integrations: {
    ga4Configured: boolean;
    ga4DataApiConfigured?: boolean;
    metaPixelConfigured: boolean;
    indexNowConfigured: boolean;
    googleIndexingConfigured: boolean;
  };
};

type Ga4Data = {
  visitorsToday: number;
  visitors7d: number;
  visitors30d: number;
  topPages: Array<{ path: string; views: number }>;
  countries: Array<{ country: string; users: number }>;
  devices: Array<{ type: string; users: number }>;
  trafficSources: Array<{ source: string; sessions: number }>;
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
  const [ga4Expanded, setGa4Expanded] = useState(false);
  const [ga4Data, setGa4Data] = useState<Ga4Data | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState<string | null>(null);

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

  const loadGa4 = useCallback(async () => {
    setGa4Loading(true);
    setGa4Error(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/analytics/ga4", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = json?.error?.message ?? "Analytics temporarily unavailable.";
        if (resp.status === 400) setGa4Error("Google Analytics API Not Configured");
        else setGa4Error(msg);
        setGa4Data(null);
        return;
      }
      setGa4Data(json.data ?? null);
    } catch {
      setGa4Error("Analytics temporarily unavailable.");
      setGa4Data(null);
    } finally {
      setGa4Loading(false);
    }
  }, []);

  useEffect(() => {
    if (ga4Expanded && data?.integrations?.ga4DataApiConfigured) void loadGa4();
  }, [ga4Expanded, data?.integrations?.ga4DataApiConfigured, loadGa4]);

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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                fontWeight: 900,
                marginBottom: ga4Expanded ? 12 : 0,
              }}
              onClick={() => setGa4Expanded((e) => !e)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => ev.key === "Enter" && setGa4Expanded((e) => !e)}
            >
              Advanced Analytics {ga4Expanded ? "▲" : "▼"}
            </div>
            {ga4Expanded && (
              <div style={{ marginTop: 12 }}>
                {!data.integrations.ga4DataApiConfigured ? (
                  <div style={{ color: "var(--muted)", fontSize: 14 }}>Google Analytics API Not Configured. Set GA4_PROPERTY_ID and Google service account credentials.</div>
                ) : ga4Loading ? (
                  <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading GA4 data…</div>
                ) : ga4Error ? (
                  <div style={{ color: "rgba(254,202,202,0.95)", fontSize: 14 }}>{ga4Error}</div>
                ) : ga4Data ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>Traffic Overview</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <div style={statCard}>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>{ga4Data.visitorsToday}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>Visitors Today</div>
                      </div>
                      <div style={statCard}>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>{ga4Data.visitors7d}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>Visitors Last 7 Days</div>
                      </div>
                      <div style={statCard}>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>{ga4Data.visitors30d}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>Visitors Last 30 Days</div>
                      </div>
                    </div>

                    {ga4Data.topPages.length > 0 && (
                      <>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>Top Pages</div>
                        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                              <th style={{ padding: "8px 0" }}>Page URL</th>
                              <th style={{ padding: "8px 0" }}>Views</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ga4Data.topPages.map((p, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                                <td style={{ padding: "8px 0", fontFamily: "monospace", fontSize: 12 }}>{p.path}</td>
                                <td style={{ padding: "8px 0" }}>{p.views}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {ga4Data.trafficSources.length > 0 && (
                      <>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>Traffic Sources</div>
                        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                              <th style={{ padding: "8px 0" }}>Source</th>
                              <th style={{ padding: "8px 0" }}>Sessions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ga4Data.trafficSources.map((s, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                                <td style={{ padding: "8px 0" }}>{s.source}</td>
                                <td style={{ padding: "8px 0" }}>{s.sessions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {ga4Data.devices.length > 0 && (
                      <>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>Device Breakdown</div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {ga4Data.devices.map((d, i) => (
                            <div key={i} style={{ ...statCard, minWidth: 100 }}>
                              <div style={{ fontSize: 20, fontWeight: 900 }}>{d.users}</div>
                              <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "capitalize" }}>{d.type}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {ga4Data.countries.length > 0 && (
                      <>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>Country Traffic</div>
                        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                              <th style={{ padding: "8px 0" }}>Country</th>
                              <th style={{ padding: "8px 0" }}>Users</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ga4Data.countries.map((c, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                                <td style={{ padding: "8px 0" }}>{c.country}</td>
                                <td style={{ padding: "8px 0" }}>{c.users}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}
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
