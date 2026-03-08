"use client";

import { useCallback, useEffect, useState } from "react";

const CANADIAN_PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "YT", name: "Yukon" },
];

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
  const [form, setForm] = useState({ countryCode: "CA", regionCode: "", combinedRate: "" });
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    setSubmitError(null);
    const rate = Number(form.combinedRate);
    if (!form.regionCode || (Number.isNaN(rate) || rate < 0 || rate > 100)) {
      setSubmitError("Select a province and enter a valid tax rate (0–100).");
      return;
    }
    try {
      const resp = await fetch("/api/admin/v4/tax/regions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countryCode: "CA",
          regionCode: form.regionCode,
          regionName: CANADIAN_PROVINCES.find((p) => p.code === form.regionCode)?.name ?? form.regionCode,
          combinedRate: rate,
          gstRate: 0,
          pstRate: 0,
          hstRate: 0,
          active: true,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        const errMsg = json?.error?.message ?? json?.error ?? json?.message ?? "Failed to add region";
        setSubmitError(String(errMsg));
        return;
      }
      setForm({ countryCode: "CA", regionCode: "", combinedRate: "" });
      await load();
    } catch {
      setSubmitError("Failed to add region");
    }
  }

  async function toggleActive(r: TaxRegion) {
    await fetch(`/api/admin/v4/tax/regions/${encodeURIComponent(r.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    await load();
  }

  function formatRate(v: string | number): string {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(3) : String(v);
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Tax Regions</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Manage Canadian province tax rates. US jobs are not taxed.
      </p>

      <form onSubmit={createRegion} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "rgba(226,232,240,0.8)", fontWeight: 700 }}>Country: CA</span>
        <select
          value={form.regionCode}
          onChange={(e) => setForm((v) => ({ ...v, regionCode: e.target.value }))}
          style={selectStyle}
          aria-label="Province"
        >
          <option value="">Select province</option>
          {CANADIAN_PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.001"
          min={0}
          max={100}
          value={form.combinedRate}
          onChange={(e) => setForm((v) => ({ ...v, combinedRate: e.target.value }))}
          placeholder="Tax rate (e.g. 12)"
          style={inputStyle}
          aria-label="Tax rate %"
        />
        <span style={{ color: "rgba(226,232,240,0.7)", fontSize: 13 }}>%</span>
        <button type="submit" style={buttonStyle}>Add Region</button>
      </form>

      {submitError ? <div style={{ marginTop: 8, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{submitError}</div> : null}

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
                {["Country", "Region", "Province", "Tax Rate", "Active"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.countryCode}</td>
                  <td style={tdStyle}>{r.regionCode}</td>
                  <td style={tdStyle}>{r.regionName}</td>
                  <td style={tdStyle}>{formatRate(r.combinedRate)}%</td>
                  <td style={tdStyle}>
                    <button style={buttonStyle} onClick={() => void toggleActive(r)}>
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
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
  width: 120,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 220,
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid rgba(148,163,184,0.2)",
  padding: "8px 10px",
  fontSize: 12,
  color: "rgba(226,232,240,0.7)",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.1)",
  padding: "8px 10px",
  color: "rgba(226,232,240,0.9)",
  fontSize: 13,
};
