"use client";

import { useEffect, useState } from "react";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";
import { formatNumber } from "@/lib/formatters";

type ChannelRow = {
  channel: string;
  leads: number;
  emails_sent: number;
  responses: number;
  signups: number;
  conversion: string;
  cost: string;
  cost_per_signup: string | null;
};

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>{title}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
}

export default function ChannelsPage() {
  const [data, setData] = useState<ChannelRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    lgsFetch("/api/lgs/reports/channels")
      .then((r) => {
        const raw = r as unknown as { ok: boolean; data?: ChannelRow[]; error?: string };
        if (raw.ok) setData(raw.data ?? []);
        else setErr(raw.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const totalLeads = data.reduce((s, r) => s + r.leads, 0);
  const totalSignups = data.reduce((s, r) => s + r.signups, 0);
  const bestChannel = data.reduce<ChannelRow | null>((best, r) => {
    if (!best) return r;
    const rConv = parseFloat(r.conversion) || 0;
    const bConv = parseFloat(best.conversion) || 0;
    return rConv > bConv ? r : best;
  }, null);
  const topByLeads = data.reduce<ChannelRow | null>((top, r) => (!top || r.leads > top.leads ? r : top), null);

  if (err) return <p style={{ color: "#f87171", padding: "2rem" }}>{err}</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Acquisition Channels</h1>
        <HelpTooltip text={helpText.acquisitionChannels} />
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard title="Total Leads" value={formatNumber(totalLeads)} />
        <StatCard title="Active Channels" value={data.length} />
        <StatCard title="Total Signups" value={formatNumber(totalSignups)} />
        <StatCard
          title="Best Conversion"
          value={bestChannel ? bestChannel.conversion : "—"}
          sub={bestChannel?.channel ?? undefined}
        />
        <StatCard
          title="Top Lead Source"
          value={topByLeads ? formatNumber(topByLeads.leads) : "—"}
          sub={topByLeads?.channel ?? undefined}
        />
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : data.length === 0 ? (
        <div style={{ padding: "2rem", background: "#1e293b", borderRadius: 8, textAlign: "center", color: "#94a3b8" }}>
          <p style={{ margin: 0 }}>No channel data yet. Import leads with a source column to see acquisition analytics.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Channel</th>
                <th style={{ padding: "0.75rem 1rem" }}>Leads</th>
                <th style={{ padding: "0.75rem 1rem" }}>Emails Sent</th>
                <th style={{ padding: "0.75rem 1rem" }}>Replies</th>
                <th style={{ padding: "0.75rem 1rem" }}>Signups</th>
                <th style={{ padding: "0.75rem 1rem" }}>Conversion</th>
                <th style={{ padding: "0.75rem 1rem" }}>Cost</th>
                <th style={{ padding: "0.75rem 1rem" }}>Cost / Signup</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.channel ?? ""} style={{ borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>
                    <span style={{
                      display: "inline-block",
                      padding: "0.15rem 0.5rem",
                      background: "#0f172a",
                      borderRadius: 4,
                      fontFamily: "monospace",
                      fontSize: "0.82rem",
                    }}>{row.channel}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.leads)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.emails_sent)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.responses)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{formatNumber(row.signups)}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      color: parseFloat(row.conversion) > 0 ? "#4ade80" : "#94a3b8",
                      fontWeight: 600,
                    }}>{row.conversion}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>${row.cost}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{row.cost_per_signup ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
