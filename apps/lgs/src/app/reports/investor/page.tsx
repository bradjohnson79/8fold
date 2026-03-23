"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type FunnelData = {
  total_leads: number;
  emails_sent: number;
  bounces: number;
  replies: number;
  signups: number;
  active_contractors: number;
  active_job_posters: number;
  bounce_rate: number;
  reply_rate: number;
  conversion_rate: number;
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeFunnelData(value: Partial<FunnelData> | null | undefined): FunnelData {
  return {
    total_leads: toNumber(value?.total_leads),
    emails_sent: toNumber(value?.emails_sent),
    bounces: toNumber(value?.bounces),
    replies: toNumber(value?.replies),
    signups: toNumber(value?.signups),
    active_contractors: toNumber(value?.active_contractors),
    active_job_posters: toNumber(value?.active_job_posters),
    bounce_rate: toNumber(value?.bounce_rate),
    reply_rate: toNumber(value?.reply_rate),
    conversion_rate: toNumber(value?.conversion_rate),
  };
}

function formatNumber(value: unknown): string {
  return toNumber(value).toLocaleString();
}

type ChannelRow = { channel: string; leads: number; signups: number; conversion: string };
type RegionRow = { state: string; city: string; leads: number; signups: number; status: string };

function MetricCard({ title, value, color = "#f8fafc", sub }: { title: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>{title}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color }}>{typeof value === "number" ? formatNumber(value) : value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
}

function RateBar({ label, value, color = "#3b82f6" }: { label: string; value: number; color?: string }) {
  const pct = Math.min(value, 100);
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
        <span style={{ color: "#94a3b8" }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function FunnelStep({ label, value, pct, color }: { label: string; value: number; pct?: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.65rem 0", borderBottom: "1px solid #1e293b" }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: "0.9rem", color: "#94a3b8" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: "1rem" }}>{formatNumber(value)}</div>
      {pct && <div style={{ fontSize: "0.8rem", color: "#475569", width: 55, textAlign: "right" }}>{pct}</div>}
    </div>
  );
}

export default function InvestorPage() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      lgsFetch("/api/lgs/funnel"),
      lgsFetch("/api/lgs/reports/channels"),
      lgsFetch("/api/lgs/regions"),
    ])
      .then(([r1, r2, r3]) => {
        // lgsFetch returns raw JSON; each r IS the full response
        const f = r1 as unknown as { ok: boolean; data?: FunnelData; error?: string };
        const c = r2 as unknown as { ok: boolean; data?: ChannelRow[]; error?: string };
        const rg = r3 as unknown as { ok: boolean; data?: RegionRow[]; error?: string };

        if (f.ok && f.data) setFunnel(normalizeFunnelData(f.data));
        else setErr(f.error ?? "Failed to load funnel");

        if (c.ok) setChannels(c.data ?? []);
        if (rg.ok) setRegions(rg.data ?? []);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (err) return <p style={{ color: "#f87171", padding: "2rem" }}>{err}</p>;

  const conversionRate = funnel?.conversion_rate?.toFixed(1) ?? "0.0";
  const responseRate = funnel?.reply_rate?.toFixed(1) ?? "0.0";

  const topChannels = [...channels]
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5);

  const topCities = [...regions]
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Investor Snapshot</h1>
        <HelpTooltip text={helpText.investorSnapshot} />
      </div>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "2rem" }}>
        Lean operating snapshot — as of {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : (
        <>
          {/* Primary KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <MetricCard title="Total Leads" value={funnel?.total_leads ?? 0} />
            <MetricCard title="Emails Sent" value={funnel?.emails_sent ?? 0} color="#60a5fa" />
            <MetricCard title="Bounces" value={funnel?.bounces ?? 0} color="#f59e0b" />
            <MetricCard title="Replies" value={funnel?.replies ?? 0} color="#a78bfa" />
            <MetricCard title="Signups" value={funnel?.signups ?? 0} color="#4ade80" />
            <MetricCard title="Active Contractors" value={funnel?.active_contractors ?? 0} color="#34d399" />
            <MetricCard title="Active Job Posters" value={funnel?.active_job_posters ?? 0} color="#38bdf8" />
            <MetricCard
              title="Conversion Rate"
              value={`${conversionRate}%`}
              color={parseFloat(conversionRate) > 0 ? "#4ade80" : "#94a3b8"}
              sub="sent → signup"
            />
            <MetricCard title="Response Rate" value={`${responseRate}%`} color="#a78bfa" sub="sent → reply" />
          </div>

          {/* Two-column layout: funnel + rates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
            {/* Acquisition funnel steps */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Operating Funnel
              </h3>
              <FunnelStep label="Total Leads" value={funnel?.total_leads ?? 0} color="#3b82f6" />
              <FunnelStep label="Emails Sent" value={funnel?.emails_sent ?? 0} pct={funnel?.total_leads ? `${((funnel.emails_sent / funnel.total_leads) * 100).toFixed(0)}%` : "—"} color="#60a5fa" />
              <FunnelStep label="Bounces" value={funnel?.bounces ?? 0} pct={funnel?.emails_sent ? `${((funnel.bounces / funnel.emails_sent) * 100).toFixed(0)}%` : "—"} color="#f59e0b" />
              <FunnelStep label="Replies" value={funnel?.replies ?? 0} pct={funnel?.emails_sent ? `${((funnel.replies / funnel.emails_sent) * 100).toFixed(0)}%` : "—"} color="#a78bfa" />
              <FunnelStep label="Contractor Signups" value={funnel?.signups ?? 0} pct={funnel?.replies ? `${((funnel.signups / funnel.replies) * 100).toFixed(0)}%` : "—"} color="#4ade80" />
            </div>

            {/* Rate metrics */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Performance Rates
              </h3>
              <RateBar label="Response Rate" value={parseFloat(responseRate)} color="#a78bfa" />
              <RateBar label="Bounce Rate" value={funnel?.bounce_rate ?? 0} color="#f59e0b" />
              <RateBar label="Conversion Rate" value={parseFloat(conversionRate)} color="#4ade80" />

              {funnel && (
                <div style={{ marginTop: "1.25rem", padding: "0.75rem", background: "#0f172a", borderRadius: 7, fontSize: "0.8rem", color: "#64748b" }}>
                  Bounce rate: <strong style={{ color: funnel.bounce_rate > 10 ? "#f87171" : "#4ade80" }}>{funnel.bounce_rate}%</strong>
                  {" · "}Active job posters: <strong style={{ color: "#94a3b8" }}>{formatNumber(funnel.active_job_posters)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Top channels + top cities */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
            {/* Best Acquisition Channels */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Top Channels
                </h3>
                <Link href="/channels" style={{ fontSize: "0.78rem", color: "#38bdf8" }}>View all →</Link>
              </div>
              {topChannels.length === 0 ? (
                <p style={{ color: "#475569", fontSize: "0.85rem" }}>No data yet.</p>
              ) : (
                topChannels.map((c) => (
                  <div key={c.channel} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #0f172a" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "#94a3b8" }}>{c.channel}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 600 }}>{formatNumber(c.leads)}</span>
                      <span style={{ color: "#475569", fontSize: "0.78rem", marginLeft: 8 }}>leads</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Top Cities */}
            <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Top Cities
                </h3>
                <Link href="/regions" style={{ fontSize: "0.78rem", color: "#38bdf8" }}>View all →</Link>
              </div>
              {topCities.length === 0 ? (
                <p style={{ color: "#475569", fontSize: "0.85rem" }}>No regional data yet.</p>
              ) : (
                topCities.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #0f172a" }}>
                    <span style={{ fontSize: "0.87rem" }}>
                      {r.city || "Unknown"}
                      {r.state && <span style={{ color: "#475569", marginLeft: 4 }}>{r.state}</span>}
                    </span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 600 }}>{formatNumber(r.leads)}</span>
                      <span style={{ color: "#475569", fontSize: "0.78rem", marginLeft: 8 }}>leads</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <p style={{ color: "#475569", fontSize: "0.82rem" }}>
            Export to PDF / CSV — coming soon.
          </p>
        </>
      )}
    </div>
  );
}
