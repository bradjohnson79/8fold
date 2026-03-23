"use client";

import { useEffect, useState } from "react";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";
import { formatNumber } from "@/lib/formatters";

type RegionRow = {
  state: string;
  city: string;
  leads: number;
  emails_sent: number;
  responses: number;
  signups: number;
  status: string;
  status_color: string;
};

type StateRow = { state: string; leads: number; signups: number; status: string };

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>{title}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{typeof value === "number" ? formatNumber(value) : value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
}

const STATUS_ORDER = ["Launch Ready", "Strong", "Growing", "Seeding"];

export default function RegionsPage() {
  const [data, setData] = useState<RegionRow[]>([]);
  const [byState, setByState] = useState<StateRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"city" | "state">("city");

  useEffect(() => {
    lgsFetch("/api/lgs/regions")
      .then((r) => {
        const raw = r as unknown as { ok: boolean; data?: RegionRow[]; by_state?: StateRow[]; error?: string };
        if (raw.ok) {
          setData(raw.data ?? []);
          setByState(raw.by_state ?? []);
        } else setErr(raw.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const totalLeads = data.reduce((s, r) => s + r.leads, 0);
  const launchReady = data.filter((r) => r.status === "Launch Ready").length;
  const topCity = data[0];
  const uniqueStates = new Set(data.map((r) => r.state).filter(Boolean)).size;

  if (err) return <p style={{ color: "#f87171", padding: "2rem" }}>{err}</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Region Launch Tracker</h1>
        <HelpTooltip text={helpText.regions} />
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard title="Total Leads" value={totalLeads} />
        <StatCard title="States" value={uniqueStates} />
        <StatCard title="Cities Tracked" value={data.length} />
        <StatCard title="Launch Ready" value={launchReady} sub="cities with 300+ leads" />
        <StatCard title="Top City" value={topCity?.city ?? "—"} sub={topCity ? `${topCity.leads} leads` : undefined} />
      </div>

      {/* Readiness legend */}
      <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1.5rem", flexWrap: "wrap", fontSize: "0.82rem" }}>
        {[
          { label: "Seeding", desc: "0–49 leads", color: "#94a3b8" },
          { label: "Growing", desc: "50–149 leads", color: "#facc15" },
          { label: "Strong", desc: "150–299 leads", color: "#60a5fa" },
          { label: "Launch Ready", desc: "300+ leads", color: "#4ade80" },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: "#64748b" }}>{s.desc}</span>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(["city", "state"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            style={{
              padding: "0.3rem 0.75rem",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontWeight: view === v ? 600 : 400,
              background: view === v ? "#334155" : "#1e293b",
              color: view === v ? "#f8fafc" : "#94a3b8",
              fontSize: "0.85rem",
            }}
          >
            {v === "city" ? "By City" : "By State"}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : data.length === 0 ? (
        <div style={{ padding: "2rem", background: "#1e293b", borderRadius: 8, textAlign: "center", color: "#94a3b8" }}>
          <p style={{ margin: 0 }}>No regional data yet. Import leads with city/state columns.</p>
        </div>
      ) : view === "city" ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 1rem" }}>State</th>
                <th style={{ padding: "0.75rem 1rem" }}>City</th>
                <th style={{ padding: "0.75rem 1rem" }}>Leads</th>
                <th style={{ padding: "0.75rem 1rem" }}>Emails Sent</th>
                <th style={{ padding: "0.75rem 1rem" }}>Responses</th>
                <th style={{ padding: "0.75rem 1rem" }}>Signups</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{row.state || "—"}</td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>{row.city || "—"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.leads)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.emails_sent)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.responses)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.signups)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      padding: "0.2rem 0.55rem",
                      borderRadius: 4,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: row.status_color,
                      background: row.status_color + "1a",
                    }}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 1rem" }}>State</th>
                <th style={{ padding: "0.75rem 1rem" }}>Leads</th>
                <th style={{ padding: "0.75rem 1rem" }}>Signups</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {byState.map((row) => {
                const color =
                  row.status === "Launch Ready" ? "#4ade80" :
                  row.status === "Strong" ? "#60a5fa" :
                  row.status === "Growing" ? "#facc15" : "#94a3b8";
                return (
                  <tr key={row.state} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>{row.state || "Unknown"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.leads)}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.signups)}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <span style={{ padding: "0.2rem 0.55rem", borderRadius: 4, fontSize: "0.78rem", fontWeight: 600, color, background: color + "1a" }}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
