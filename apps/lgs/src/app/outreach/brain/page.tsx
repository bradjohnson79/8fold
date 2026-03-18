"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type SenderStat = {
  email: string;
  health_score: string;
  sent_today: number;
  daily_limit: number;
  remaining: number;
  capacity_pct: number;
  reply_rate: number;
  warmup_status: string;
  outreach_enabled: boolean;
  is_cooling_down: boolean;
  cooldown_until: string | null;
};

type NextToSendItem = {
  lead_id: string;
  business_name: string | null;
  email: string;
  lead_score: number;
  lead_priority: string;
  outreach_stage: string;
  followup_count: number;
  subject: string | null;
  assigned_sender: string | null;
  reason_labels: string[];
};

type BrainData = {
  lead_distribution: { high: number; medium: number; low: number; total_active: number };
  stage_counts: Record<string, number>;
  sender_panel: SenderStat[];
  followup_tracker: { due_today: number; due_tomorrow: number; overdue: number };
  metrics: {
    sent_today: number;
    pending_queue: number;
    messages_ready: number;
    replies_7d: number;
    conversions_30d: number;
    avg_sender_health: string;
    high_priority_leads: number;
  };
  next_to_send: NextToSendItem[];
};

// ── Color helpers ─────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#3b82f6",
  low: "#94a3b8",
  archived: "#ef4444",
};

const HEALTH_COLORS: Record<string, string> = {
  good: "#22c55e",
  warning: "#f59e0b",
  risk: "#ef4444",
  unknown: "#64748b",
};

const STAGE_COLORS: Record<string, string> = {
  not_contacted: "#64748b",
  message_ready: "#a78bfa",
  queued: "#eab308",
  sent: "#3b82f6",
  replied: "#22c55e",
  converted: "#8b5cf6",
  paused: "#ef4444",
  archived: "#475569",
};

function HealthBadge({ score }: { score: string }) {
  const color = HEALTH_COLORS[score] ?? "#64748b";
  const label = score === "unknown" ? "—" : score.charAt(0).toUpperCase() + score.slice(1);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "#64748b";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        textTransform: "capitalize",
      }}
    >
      {priority}
    </span>
  );
}

function StatChip({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "1rem 1.25rem",
        minWidth: 120,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? "#f1f5f9" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrainPage() {
  const [data, setData] = useState<BrainData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(() => {
    lgsFetch<{ data: BrainData }>("/api/lgs/outreach/brain")
      .then((r) => {
        if (r.ok && r.data) {
          setData((r.data as { data: BrainData }).data);
          setLastUpdated(new Date());
        } else {
          setErr(r.error ?? "Failed to load brain data");
        }
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [load]);

  if (err) {
    return (
      <div>
        <h1 style={{ marginBottom: "1rem" }}>Outreach Brain</h1>
        <p style={{ color: "#f87171" }}>{err}</p>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>← Back</Link>
      </div>
    );
  }

  const m = data?.metrics;
  const dist = data?.lead_distribution;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Outreach Brain</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: 13 }}>
            Central command center for intelligent outreach
            {lastUpdated && (
              <span style={{ marginLeft: 8 }}>· Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link
            href="/settings/outreach"
            style={{ padding: "0.5rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", textDecoration: "none", fontSize: 13 }}
          >
            Settings
          </Link>
          <Link
            href="/outreach/queue"
            style={{ padding: "0.5rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", textDecoration: "none", fontSize: 13 }}
          >
            Queue
          </Link>
          <Link
            href="/leads"
            style={{ padding: "0.5rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", textDecoration: "none", fontSize: 13 }}
          >
            Leads
          </Link>
        </div>
      </div>

      {!data ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : (
        <>
          {/* ── Section 1: System Overview ─────────────────────────────────── */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 600 }}>
              System Overview
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <StatChip label="High Priority Leads" value={m?.high_priority_leads ?? 0} color={PRIORITY_COLORS.high} />
              <StatChip label="Messages Ready" value={m?.messages_ready ?? 0} color="#a78bfa" />
              <StatChip label="Pending Queue" value={m?.pending_queue ?? 0} color="#eab308" />
              <StatChip label="Sent Today" value={m?.sent_today ?? 0} color="#3b82f6" />
              <StatChip label="Follow-ups Due" value={data.followup_tracker.due_today} color="#f59e0b" sub="today" />
              <StatChip label="Replies" value={m?.replies_7d ?? 0} sub="7 days" color="#22c55e" />
              <StatChip label="Conversions" value={m?.conversions_30d ?? 0} sub="30 days" color="#8b5cf6" />
              <StatChip
                label="Avg Sender Health"
                value={(m?.avg_sender_health ?? "unknown").charAt(0).toUpperCase() + (m?.avg_sender_health ?? "unknown").slice(1)}
                color={HEALTH_COLORS[m?.avg_sender_health ?? "unknown"]}
              />
            </div>
          </section>

          {/* ── Section 2: Lead Distribution ──────────────────────────────── */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 600 }}>
              Lead Distribution
            </h2>
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "1.25rem" }}>
              {dist && (
                <>
                  <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    {[
                      { label: "High", count: dist.high, color: PRIORITY_COLORS.high },
                      { label: "Medium", count: dist.medium, color: PRIORITY_COLORS.medium },
                      { label: "Low", count: dist.low, color: PRIORITY_COLORS.low },
                    ].map((item) => (
                      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: "inline-block" }} />
                        <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{item.count.toLocaleString()}</span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          {item.label} ({dist.total_active > 0 ? Math.round((item.count / dist.total_active) * 100) : 0}%)
                        </span>
                      </div>
                    ))}
                    <div style={{ color: "#64748b", fontSize: 12, marginLeft: "auto", alignSelf: "center" }}>
                      {dist.total_active.toLocaleString()} total active
                    </div>
                  </div>
                  {dist.total_active > 0 && (
                    <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 1 }}>
                      {[
                        { count: dist.high, color: PRIORITY_COLORS.high },
                        { count: dist.medium, color: PRIORITY_COLORS.medium },
                        { count: dist.low, color: PRIORITY_COLORS.low },
                      ].map((seg, i) => (
                        <div
                          key={i}
                          style={{
                            width: `${(seg.count / dist.total_active) * 100}%`,
                            background: seg.color,
                            minWidth: seg.count > 0 ? 2 : 0,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
            {/* ── Section 3: Sender Health Panel ────────────────────────────── */}
            <section>
              <h2 style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 600 }}>
                Sender Health
              </h2>
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155" }}>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Sender</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Health</th>
                      <th style={{ textAlign: "right", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Sent / Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sender_panel.map((s) => (
                      <tr key={s.email} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <div style={{ color: "#f1f5f9", fontFamily: "monospace", fontSize: 12 }}>
                            {s.email.split("@")[0]}@
                          </div>
                          {s.is_cooling_down && (
                            <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2 }}>
                              Cooldown until {s.cooldown_until ? new Date(s.cooldown_until).toLocaleTimeString() : "?"}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <HealthBadge score={s.health_score} />
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
                          <div style={{ color: "#f1f5f9" }}>{s.sent_today} / {s.daily_limit}</div>
                          <div style={{ marginTop: 3, height: 3, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.min(100, s.capacity_pct)}%`,
                                background: s.capacity_pct > 90 ? "#ef4444" : s.capacity_pct > 70 ? "#f59e0b" : "#22c55e",
                                borderRadius: 2,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {data.sender_panel.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: "1rem 0.75rem", color: "#64748b", textAlign: "center" }}>No active senders</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ padding: "0.5rem 0.75rem", borderTop: "1px solid #334155" }}>
                  <Link href="/outreach/warmup" style={{ fontSize: 12, color: "#64748b", textDecoration: "none" }}>
                    View warmup details →
                  </Link>
                </div>
              </div>
            </section>

            {/* ── Section 4: Follow-up Tracker ──────────────────────────────── */}
            <section>
              <h2 style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 600 }}>
                Follow-up Tracker
              </h2>
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {[
                  { label: "Due Today", value: data.followup_tracker.due_today, color: "#f59e0b" },
                  { label: "Due Tomorrow", value: data.followup_tracker.due_tomorrow, color: "#3b82f6" },
                  { label: "Overdue", value: data.followup_tracker.overdue, color: "#ef4444" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.75rem 1rem",
                      background: "#0f172a",
                      borderRadius: 6,
                      border: `1px solid ${item.color}22`,
                    }}
                  >
                    <span style={{ color: "#94a3b8", fontSize: 14 }}>{item.label}</span>
                    <span style={{ color: item.color, fontWeight: 700, fontSize: 20 }}>
                      {item.value}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: "0.25rem" }}>
                  <Link href="/leads?needs_followup=1" style={{ fontSize: 12, color: "#64748b", textDecoration: "none" }}>
                    View leads needing follow-up →
                  </Link>
                </div>
              </div>
            </section>
          </div>

          {/* ── Section 5: Next 10 to Send ────────────────────────────────── */}
          <section>
            <h2 style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 600 }}>
              Next to Send
            </h2>
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155" }}>
                    <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Business</th>
                    <th style={{ textAlign: "center", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Score</th>
                    <th style={{ textAlign: "center", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Priority</th>
                    <th style={{ textAlign: "center", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Stage</th>
                    <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Sender</th>
                    <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", color: "#64748b", fontWeight: 500 }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.next_to_send.map((row, i) => (
                    <tr key={row.lead_id} style={{ borderBottom: "1px solid #334155", background: i % 2 === 0 ? "transparent" : "#0f172a11" }}>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <div style={{ color: "#f1f5f9", fontWeight: 500 }}>{row.business_name ?? "—"}</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>{row.email}</div>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                        <span style={{ color: row.lead_score >= 80 ? "#22c55e" : row.lead_score >= 55 ? "#3b82f6" : "#94a3b8", fontWeight: 600 }}>
                          {row.lead_score}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                        <PriorityBadge priority={row.lead_priority} />
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: STAGE_COLORS[row.outreach_stage] ?? "#64748b" }}>
                          {row.outreach_stage.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <span style={{ color: "#64748b", fontFamily: "monospace", fontSize: 11 }}>
                          {row.assigned_sender ? row.assigned_sender.split("@")[0] + "@" : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <div style={{ color: "#94a3b8", fontSize: 11 }}>
                          {row.reason_labels.join(" · ")}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.next_to_send.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "1.5rem 0.75rem", color: "#64748b", textAlign: "center" }}>
                        No messages pending in queue
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ padding: "0.5rem 0.75rem", borderTop: "1px solid #334155" }}>
                <Link href="/outreach/queue" style={{ fontSize: 12, color: "#64748b", textDecoration: "none" }}>
                  View full queue →
                </Link>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
