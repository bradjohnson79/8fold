"use client";

import { useCallback, useEffect, useState } from "react";

type TaxRegion = {
  id: string;
  countryCode: string;
  regionCode: string;
  regionName: string;
  combinedRate: string | number;
  gstRate: string | number;
  pstRate: string | number;
  hstRate: string | number;
  active: boolean;
};

export default function TaxRegionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<TaxRegion[]>([]);
  const [form, setForm] = useState({ countryCode: "CA", regionCode: "", regionName: "", combinedRate: "0" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/tax/regions", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load tax regions"));
        return;
      }
      setRegions(Array.isArray(json.data?.regions) ? (json.data.regions as TaxRegion[]) : []);
    } catch {
      setError("Failed to load tax regions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRegion(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/v4/tax/regions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        countryCode: form.countryCode,
        regionCode: form.regionCode,
        regionName: form.regionName,
        combinedRate: Number(form.combinedRate),
        gstRate: 0,
        pstRate: 0,
        hstRate: 0,
        active: true,
      }),
    });
    setForm({ countryCode: "CA", regionCode: "", regionName: "", combinedRate: "0" });
    await load();
  }

  async function toggleActive(r: TaxRegion) {
    await fetch(`/api/admin/v4/tax/regions/${encodeURIComponent(r.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Tax Regions</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>Manage country/province tax rates.</p>

      <form onSubmit={createRegion} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={form.countryCode} onChange={(e) => setForm((v) => ({ ...v, countryCode: e.target.value.toUpperCase() }))} placeholder="Country" style={inputStyle} />
        <input value={form.regionCode} onChange={(e) => setForm((v) => ({ ...v, regionCode: e.target.value.toUpperCase() }))} placeholder="Region" style={inputStyle} />
        <input value={form.regionName} onChange={(e) => setForm((v) => ({ ...v, regionName: e.target.value }))} placeholder="Region Name" style={inputStyle} />
        <input value={form.combinedRate} onChange={(e) => setForm((v) => ({ ...v, combinedRate: e.target.value }))} placeholder="Rate (0.12)" style={inputStyle} />
        <button type="submit" style={buttonStyle}>Add Region</button>
      </form>

      {loading ? <div style={{ marginTop: 12 }}>Loading regions...</div> : null}
      {error ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && regions.length === 0 ? <div style={{ marginTop: 12 }}>No tax regions configured.</div> : null}

      {!loading && !error && regions.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Country",
                  "Region",
                  "Name",
                  "Combined",
                  "GST",
                  "PST",
                  "HST",
                  "Active",
                ].map((h) => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.countryCode}</td>
                  <td style={tdStyle}>{r.regionCode}</td>
                  <td style={tdStyle}>{r.regionName}</td>
                  <td style={tdStyle}>{String(r.combinedRate)}</td>
                  <td style={tdStyle}>{String(r.gstRate)}</td>
                  <td style={tdStyle}>{String(r.pstRate)}</td>
                  <td style={tdStyle}>{String(r.hstRate)}</td>
                  <td style={tdStyle}><button style={buttonStyle} onClick={() => void toggleActive(r)}>{r.active ? "Active" : "Inactive"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
};
const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  padding: "7px 10px",
  fontWeight: 900,
  cursor: "pointer",
};
const thStyle: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid rgba(148,163,184,0.2)", padding: "8px 10px", fontSize: 12, color: "rgba(226,232,240,0.7)" };
const tdStyle: React.CSSProperties = { borderBottom: "1px solid rgba(148,163,184,0.1)", padding: "8px 10px", color: "rgba(226,232,240,0.9)", fontSize: 13 };
