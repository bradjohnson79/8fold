"use client";

import { useCallback, useEffect, useState } from "react";

type SitemapInfo = { urlCount: number; generatedAt: string | null };
type Sitemaps = Record<string, SitemapInfo>;

const card: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 16,
  padding: 20,
  background: "rgba(2,6,23,0.35)",
  marginBottom: 16,
};
const btn: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(134,239,172,0.4)",
  background: "rgba(134,239,172,0.12)",
  color: "rgba(134,239,172,0.95)",
  padding: "9px 20px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 14,
};

export default function SeoSitemapPage() {
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sitemaps, setSitemaps] = useState<Sitemaps>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/sitemap-status", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(String(json?.error?.message ?? "Failed to load sitemap status"));
        return;
      }
      setSitemaps(json.data?.sitemaps ?? {});
    } catch {
      setError("Failed to load sitemap status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRebuild() {
    setRebuilding(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/sitemap-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(String(json?.error?.message ?? "Failed to rebuild sitemap"));
        return;
      }
      setSitemaps(json.data?.sitemaps ?? {});
    } catch {
      setError("Failed to rebuild sitemap");
    } finally {
      setRebuilding(false);
    }
  }

  if (loading) return <div style={{ marginTop: 24 }}>Loading sitemap status...</div>;
  if (error) {
    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
        <button style={{ ...btn, marginTop: 8 }} onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  const types = ["index", "jobs", "services", "contractors", "cities", "service-locations"];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Sitemap Status</h1>
      <p style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", maxWidth: 640 }}>
        URL counts and last generated time for each sitemap. Rebuild to refresh after bulk changes.
      </p>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 900 }}>Sitemaps</div>
          <button style={btn} onClick={() => void handleRebuild()} disabled={rebuilding}>
            {rebuilding ? "Rebuilding…" : "Rebuild Sitemap"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {types.map((type) => {
            const info = sitemaps[type] ?? { urlCount: 0, generatedAt: null };
            return (
              <div
                key={type}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.15)",
                  background: "rgba(2,6,23,0.5)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,0.8)", textTransform: "uppercase" }}>
                  {type}
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{info.urlCount}</div>
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 4 }}>
                  {info.generatedAt ? new Date(info.generatedAt).toLocaleString() : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
