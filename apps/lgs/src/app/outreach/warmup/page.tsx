"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";

type WarmupSender = {
  id: string;
  sender_email: string;
  sender_status: string;
  warmup_status: string;
  warmup_day: number;
  warmup_started_at: string | null;
  warmup_emails_sent_today: number;
  warmup_total_sent: number;
  warmup_total_replies: number;
  warmup_inbox_placement: string;
  daily_warmup_limit: number;
  next_day_limit: number;
  ready_for_outreach: boolean;
  daily_outreach_limit: number;
  sent_today: number;
  warmup_sent_today: number;
  outreach_sent_today: number;
  total_sent_today: number;
  remaining_capacity: number;
  effective_warmup_budget: number;
  effective_outreach_budget: number;
  outreach_enabled: boolean;
  current_day_started_at: string | null;
  next_rollover_at: string | null;
  cooldown_until: string | null;
  is_cooling_down: boolean;
  health_score: string;
  next_warmup_send_at: string | null;
  next_activity_at: string | null;
  next_activity_type: "warmup_send" | "rollover" | null;
  next_activity_label: string;
  next_activity_reason: string | null;
  last_warmup_sent_at: string | null;
  last_warmup_result: string | null;
  last_warmup_recipient: string | null;
  warmup_stability_verified: boolean;
  warmup_stability_started_at: string | null;
  warmup_stability_required: boolean;
  warmup_stability_status: "not_applicable" | "pending_start" | "in_progress" | "complete";
};

type WarmupSummary = {
  total_senders: number;
  warming: number;
  ready_for_outreach: number;
  not_started: number;
  outreach_blocked: boolean;
  schedule: Record<string, number>;
  system_daily_capacity: number;
  system_sent_today: number;
  system_remaining: number;
  system_outreach_capacity: number;
  system_warmup_capacity: number;
  pending_queue_count: number;
  outreach_enabled_count: number;
  stability_pending_count: number;
  stability_verified_count: number;
  worker_status: string;
  worker_last_heartbeat: string | null;
  worker_last_run_status: string | null;
  next_system_warmup_send_at: string | null;
  next_system_activity_at: string | null;
  next_system_activity_type: "warmup_send" | "rollover" | null;
  next_system_activity_label: string;
  next_system_activity_reason: string | null;
};

type ActivityEntry = {
  id: number;
  sender_email: string;
  recipient_email: string;
  subject: string | null;
  message_type: string | null;
  sent_at: string | null;
  status: string;
  error_message: string | null;
};

type HealthData = {
  overall_status: string;
  heartbeat_status: string;
  heartbeat_age_seconds: number;
  worker: {
    last_heartbeat_at: string | null;
    last_run_started_at: string | null;
    last_run_finished_at: string | null;
    last_run_status: string | null;
    last_error: string | null;
  } | null;
  checks: Array<{ name: string; pass: boolean }>;
  pass_count: number;
  fail_count: number;
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "#475569", warming: "#f59e0b", ready: "#22c55e", paused: "#64748b", disabled: "#64748b",
};
const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started", warming: "Warming", ready: "Ready", paused: "Paused", disabled: "Disabled",
};
const HEALTH_COLORS: Record<string, string> = {
  good: "#22c55e", warning: "#f59e0b", risk: "#f87171", unknown: "#475569",
};
const HEALTH_LABELS: Record<string, string> = {
  good: "Good", warning: "Warning", risk: "Risk", unknown: "—",
};
const WORKER_STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e", warning: "#f59e0b", stale: "#f87171", unknown: "#475569",
};
const RESULT_COLORS: Record<string, string> = {
  sent: "#22c55e", wait: "#f59e0b", skipped: "#64748b", error: "#f87171",
};
const WARMUP_RAMP = [
  { day: 1, limit: 5 },
  { day: 2, limit: 10 },
  { day: 3, limit: 20 },
  { day: 4, limit: 35 },
  { day: 5, limit: 50 },
];

function HealthBadge({ score }: { score: string }) {
  const color = HEALTH_COLORS[score] ?? "#475569";
  const label = HEALTH_LABELS[score] ?? score;
  if (score === "unknown") return null;
  return (
    <span style={{ padding: "0.15rem 0.5rem", borderRadius: 4, fontSize: "0.7rem", fontWeight: 600, background: `${color}22`, border: `1px solid ${color}55`, color }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#475569";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span style={{ padding: "0.2rem 0.6rem", borderRadius: 4, fontSize: "0.75rem", fontWeight: 600, background: `${color}22`, border: `1px solid ${color}55`, color }}>
      {status === "warming" && <span style={{ marginRight: "0.3rem" }}>●</span>}
      {label}
    </span>
  );
}

function RoutingBadge({ isExternal }: { isExternal: boolean }) {
  const color = isExternal ? "#38bdf8" : "#a78bfa";
  const label = isExternal ? "External" : "Internal";
  return (
    <span style={{ padding: "0.1rem 0.4rem", borderRadius: 3, fontSize: "0.65rem", fontWeight: 600, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, sub, color = "#f8fafc" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: "1rem 1.25rem" }}>
      <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
}

function useCountdown(isoTarget: string | null): string {
  const [display, setDisplay] = useState("—");
  const targetRef = useRef(isoTarget);
  targetRef.current = isoTarget;

  useEffect(() => {
    function tick() {
      const t = targetRef.current;
      if (!t) { setDisplay("—"); return; }
      const diff = new Date(t).getTime() - Date.now();
      if (diff <= 0) { setDisplay("now"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setDisplay(`${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isoTarget]);

  return display;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatStabilityProgress(startedAt: string | null): string {
  if (!startedAt) return "Awaiting first clean send";
  const elapsedMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const cappedMs = Math.min(elapsedMs, 24 * 60 * 60 * 1000);
  const hours = Math.floor(cappedMs / 3_600_000);
  const minutes = Math.floor((cappedMs % 3_600_000) / 60_000);
  return `In Progress (${hours}h ${String(minutes).padStart(2, "0")}m / 24h)`;
}

function formatAbsoluteTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function isExternalEmail(email: string): boolean {
  return !email.toLowerCase().endsWith("@8fold.app");
}

function CapacityBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const barColor = pct >= 90 ? "#f87171" : pct >= 70 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#94a3b8", marginBottom: "0.3rem" }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{used} / {total}</span>
      </div>
      <div style={{ background: "#0f172a", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function WarmupProgressCard({ sender, onAction }: { sender: WarmupSender; onAction: (id: string, action: string) => Promise<void> }) {
  const [acting, setActing] = useState(false);
  const color = STATUS_COLORS[sender.warmup_status] ?? "#475569";
  const replyRate = sender.warmup_total_sent > 0
    ? Math.round((sender.warmup_total_replies / sender.warmup_total_sent) * 100)
    : 0;
  const rollover = useCountdown(sender.next_rollover_at);
  const nextWarmupCountdown = useCountdown(sender.next_warmup_send_at);

  async function act(action: string) {
    setActing(true);
    try { await onAction(sender.id, action); } finally { setActing(false); }
  }

  const isActive = sender.warmup_status === "warming" || sender.warmup_status === "ready";
  const nextActivityCountdown = useCountdown(sender.next_activity_at);

  return (
    <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", border: `1px solid ${color}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#e2e8f0", fontWeight: 600 }}>{sender.sender_email}</div>
          {sender.warmup_started_at && (
            <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.2rem" }}>Started {new Date(sender.warmup_started_at).toLocaleDateString()}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status={sender.warmup_status} />
          {sender.outreach_enabled
            ? <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#22c55e", background: "#1e3a2f", padding: "0.15rem 0.5rem", borderRadius: 4 }}>Outreach</span>
            : <span style={{ fontSize: "0.72rem", color: "#475569", background: "#1e293b", padding: "0.15rem 0.5rem", borderRadius: 4, border: "1px solid #334155" }}>Locked</span>}
          <HealthBadge score={sender.health_score} />
        </div>
      </div>

      {sender.is_cooling_down && (
        <div style={{ padding: "0.5rem 0.75rem", background: "#3b1a1a", border: "1px solid #7f1d1d", borderRadius: 6, fontSize: "0.82rem", color: "#fca5a5", marginBottom: "1rem" }}>
          Cooldown active — sending paused
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>Day</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f8fafc" }}>
            {sender.warmup_status === "not_started" ? "—" : sender.warmup_day}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>Daily Limit</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f8fafc" }}>
            {sender.warmup_status === "not_started" ? "—" : `${sender.daily_outreach_limit}/day`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>Remaining</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: sender.remaining_capacity > 0 ? "#4ade80" : "#f87171" }}>
            {sender.warmup_status === "not_started" ? "—" : sender.remaining_capacity}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>Reply Rate</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: replyRate >= 30 ? "#4ade80" : "#f8fafc" }}>
            {sender.warmup_status === "not_started" ? "—" : `${replyRate}%`}
          </div>
        </div>
      </div>

      {/* Next activity */}
      {isActive && (
        <div style={{ background: "#0f172a", borderRadius: 6, padding: "0.65rem 0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#64748b", marginBottom: "0.3rem" }}>
            <span>{sender.next_activity_label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: sender.next_activity_type === "rollover" ? "#94a3b8" : "#f59e0b", fontWeight: 600 }}>
              {nextActivityCountdown}
            </span>
          </div>
          {sender.next_activity_at && (
            <div style={{ fontSize: "0.72rem", color: "#475569" }}>
              Scheduled: {formatAbsoluteTime(sender.next_activity_at)}
            </div>
          )}
          {sender.next_activity_reason && (
            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.25rem" }}>
              {sender.next_activity_reason}
            </div>
          )}
        </div>
      )}

      {/* Last warmup sent */}
      {isActive && sender.last_warmup_sent_at && (
        <div style={{ background: "#0f172a", borderRadius: 6, padding: "0.65rem 0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", alignItems: "center" }}>
            <span style={{ color: "#64748b" }}>Last Warmup Sent</span>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{relativeTime(sender.last_warmup_sent_at)}</span>
          </div>
          {sender.last_warmup_recipient && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#94a3b8" }}>{sender.last_warmup_recipient}</span>
              <RoutingBadge isExternal={isExternalEmail(sender.last_warmup_recipient)} />
            </div>
          )}
          {sender.last_warmup_result && (
            <div style={{ marginTop: "0.3rem", fontSize: "0.72rem" }}>
              Result: <span style={{ color: RESULT_COLORS[sender.last_warmup_result] ?? "#94a3b8", fontWeight: 600 }}>{sender.last_warmup_result}</span>
            </div>
          )}
        </div>
      )}

      {/* Warmup / Outreach split */}
      {isActive && (
        <div style={{ background: "#0f172a", borderRadius: 6, padding: "0.65rem 0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#64748b", marginBottom: "0.5rem" }}>
            <span>Sends Today</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#94a3b8" }}>{sender.total_sent_today} / {sender.daily_outreach_limit}</span>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.78rem" }}>
            <span><span style={{ color: "#f59e0b" }}>Warmup:</span> <span style={{ color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{sender.warmup_sent_today}</span></span>
            <span><span style={{ color: "#38bdf8" }}>Outreach:</span> <span style={{ color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{sender.outreach_sent_today}</span></span>
            <span><span style={{ color: "#64748b" }}>Left:</span> <span style={{ color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{sender.remaining_capacity}</span></span>
          </div>
        </div>
      )}

      {/* Next rollover */}
      {isActive && sender.next_rollover_at && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#0f172a", borderRadius: 6 }}>
          <span style={{ fontSize: "0.82rem", color: "#64748b" }}>Next Rollover</span>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{rollover}</span>
        </div>
      )}

      {/* Next increase */}
      {sender.warmup_status === "warming" && (
        <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.75rem" }}>
          Next increase: <strong style={{ color: "#f59e0b" }}>+{sender.next_day_limit - sender.daily_warmup_limit}/day</strong> → {sender.next_day_limit}/day on day {sender.warmup_day + 1}
        </div>
      )}

      {sender.warmup_status === "ready" && (
        sender.warmup_stability_verified ? (
          <div style={{ padding: "0.5rem 0.75rem", background: "#1e3a2f", border: "1px solid #166534", borderRadius: 6, fontSize: "0.82rem", color: "#4ade80", marginBottom: "0.75rem" }}>
            Stability Check: Complete — outreach enabled ({sender.daily_outreach_limit}/day)
          </div>
        ) : (
          <div style={{ padding: "0.5rem 0.75rem", background: "#31210f", border: "1px solid #a16207", borderRadius: 6, fontSize: "0.82rem", color: "#fbbf24", marginBottom: "0.75rem" }}>
            <div>Stability Check: {formatStabilityProgress(sender.warmup_stability_started_at)}</div>
            <div style={{ marginTop: "0.2rem", color: "#fcd34d" }}>
              Outreach locked — completing stability validation (1 clean day required)
            </div>
          </div>
        )
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {sender.warmup_status === "not_started" && (
          <button onClick={() => void act("start")} disabled={acting}
            style={{ padding: "0.4rem 0.875rem", background: "#f59e0b", border: "none", borderRadius: 6, color: "#0f172a", fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", fontSize: "0.82rem" }}>
            {acting ? "Starting…" : "Start Warmup"}
          </button>
        )}
        {sender.warmup_status === "warming" && (
          <>
            <button onClick={() => void act("pause")} disabled={acting}
              style={{ padding: "0.4rem 0.875rem", background: "#334155", border: "1px solid #475569", borderRadius: 6, color: "#e2e8f0", cursor: acting ? "not-allowed" : "pointer", fontSize: "0.82rem" }}>
              Pause
            </button>
            <button onClick={() => void act("advance")} disabled={acting}
              style={{ padding: "0.4rem 0.875rem", background: "#1e293b", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", cursor: acting ? "not-allowed" : "pointer", fontSize: "0.82rem" }}>
              Advance Day
            </button>
          </>
        )}
        {sender.warmup_status === "paused" && (
          <button onClick={() => void act("start")} disabled={acting}
            style={{ padding: "0.4rem 0.875rem", background: "#f59e0b", border: "none", borderRadius: 6, color: "#0f172a", fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", fontSize: "0.82rem" }}>
            Resume
          </button>
        )}
        {(sender.warmup_status === "warming" || sender.warmup_status === "paused" || sender.warmup_status === "ready") && (
          <button onClick={() => void act("reset")} disabled={acting}
            style={{ padding: "0.4rem 0.875rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#64748b", cursor: acting ? "not-allowed" : "pointer", fontSize: "0.82rem" }}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export default function WarmupPage() {
  const [senders, setSenders] = useState<WarmupSender[]>([]);
  const [summary, setSummary] = useState<WarmupSummary | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [warmupRes, activityRes, healthRes] = await Promise.all([
        fetch("/api/lgs/outreach/warmup"),
        fetch("/api/lgs/outreach/warmup/activity"),
        fetch("/api/lgs/outreach/warmup/health"),
      ]);
      const warmupJson = await warmupRes.json();
      if (warmupJson.ok) {
        setSenders(warmupJson.data ?? []);
        setSummary(warmupJson.summary ?? null);
      } else {
        setErr("Failed to load warmup data");
      }
      const activityJson = await activityRes.json().catch(() => ({ ok: false }));
      if (activityJson.ok) setActivity(activityJson.data ?? []);
      const healthJson = await healthRes.json().catch(() => ({ ok: false }));
      if (healthJson.ok) setHealth(healthJson.data ?? null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function handleAction(id: string, action: string) {
    await fetch(`/api/lgs/outreach/warmup/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
  }

  const systemCountdown = useCountdown(summary?.next_system_activity_at ?? null);

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Email Warmup</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
            Gradually ramp sending volume so inbox providers trust your domain before cold outreach starts.
          </p>
        </div>
        <Link href="/settings/senders" style={{ padding: "0.55rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: "0.875rem", color: "#94a3b8", textDecoration: "none" }}>
          Manage Senders →
        </Link>
      </div>

      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}

      {/* System-level header */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
              {summary.next_system_activity_label || "Next System Activity"}
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: summary.next_system_activity_type === "rollover" ? "#94a3b8" : "#f59e0b", fontVariantNumeric: "tabular-nums" }}>
              {systemCountdown}
            </div>
            {summary.next_system_activity_at && (
              <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "0.25rem" }}>
                {formatAbsoluteTime(summary.next_system_activity_at)}
              </div>
            )}
            {summary.next_system_activity_reason && (
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.25rem" }}>
                {summary.next_system_activity_reason}
              </div>
            )}
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>Last Warmup Activity</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#94a3b8" }}>{activity.length > 0 ? relativeTime(activity[0]?.sent_at ?? null) : "—"}</div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>Worker Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: WORKER_STATUS_COLORS[summary.worker_status] ?? "#475569" }} />
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: WORKER_STATUS_COLORS[summary.worker_status] ?? "#475569", textTransform: "capitalize" }}>{summary.worker_status}</span>
            </div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>Last Heartbeat</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#94a3b8" }}>{relativeTime(summary.worker_last_heartbeat)}</div>
          </div>
        </div>
      )}

      {/* Outreach blocked warning */}
      {summary?.outreach_blocked && (
        <div style={{ background: "#3b1a1a", border: "1px solid #7f1d1d", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.2rem" }}>⚠</span>
          <div>
            {summary.stability_pending_count > 0 ? (
              <>
                <div style={{ fontWeight: 600, color: "#fca5a5", marginBottom: "0.25rem" }}>
                  Outreach locked — completing stability validation (1 clean day required)
                </div>
                <div style={{ color: "#f87171", fontSize: "0.875rem" }}>
                  {summary.stability_pending_count} sender{summary.stability_pending_count === 1 ? "" : "s"} reached Day 5 and now need one full clean warmup day before outreach unlocks.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: "#fca5a5", marginBottom: "0.25rem" }}>Outreach disabled — no senders have completed warmup</div>
                <div style={{ color: "#f87171", fontSize: "0.875rem" }}>
                  Minimum requirement: <strong>50 warmup emails/day</strong> (Day 5+). Start warmup below for each sender account.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <StatCard label="Total Senders" value={summary.total_senders} />
          <StatCard label="Warming" value={summary.warming} color="#f59e0b" sub="in progress" />
          <StatCard label="Ready" value={summary.ready_for_outreach} color="#22c55e" sub="stability complete" />
          <StatCard label="Not Started" value={summary.not_started} color="#475569" />
          <StatCard label="Stability Check" value={summary.stability_pending_count} color="#f59e0b" sub="in progress" />
          <StatCard label="Queue Pending" value={summary.pending_queue_count} color="#38bdf8" sub="approved msgs" />
          <StatCard label="Outreach Enabled" value={summary.outreach_enabled_count} color="#22c55e" sub={`of ${summary.total_senders}`} />
        </div>
      )}

      {/* System capacity bar */}
      {summary && summary.system_daily_capacity > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            System Capacity
          </h2>
          <CapacityBar used={summary.system_sent_today} total={summary.system_daily_capacity} label="Total System Usage" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#38bdf8", fontVariantNumeric: "tabular-nums" }}>{summary.system_outreach_capacity}</div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Outreach Available</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{summary.system_warmup_capacity}</div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Warmup Reserved</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#22c55e", fontVariantNumeric: "tabular-nums" }}>{summary.system_remaining}</div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Remaining Today</div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : senders.length === 0 ? (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "#64748b", marginBottom: "1rem" }}>No senders configured.</p>
          <Link href="/settings/senders" style={{ color: "#38bdf8" }}>Configure senders →</Link>
        </div>
      ) : (
        <>
          {/* Sender progress cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.25rem", marginBottom: "2.5rem" }}>
            {senders.map((s) => (
              <WarmupProgressCard key={s.id} sender={s} onAction={handleAction} />
            ))}
          </div>
        </>
      )}

      {/* Worker Health Card */}
      {health && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Worker Health
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: WORKER_STATUS_COLORS[health.heartbeat_status] ?? "#475569" }} />
            <span style={{ fontSize: "1rem", fontWeight: 700, color: WORKER_STATUS_COLORS[health.heartbeat_status] ?? "#475569", textTransform: "capitalize" }}>
              {health.overall_status === "pass" ? "All Checks Passing" : health.overall_status === "warn" ? "Partial Warnings" : "Issues Detected"}
            </span>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
              ({health.pass_count}/{health.checks.length} checks pass)
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
            {health.checks.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}>
                <span style={{ color: c.pass ? "#22c55e" : "#f87171" }}>{c.pass ? "✓" : "✗"}</span>
                <span style={{ color: "#94a3b8" }}>{c.name.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
          {health.worker?.last_error && (
            <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#3b1a1a", border: "1px solid #7f1d1d", borderRadius: 6, fontSize: "0.78rem", color: "#fca5a5" }}>
              Last error: {health.worker.last_error}
            </div>
          )}
        </div>
      )}

      {/* Warmup Activity Log */}
      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setActivityOpen(!activityOpen)}>
          <h2 style={{ margin: 0, fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Warmup Activity {activity.length > 0 && <span style={{ color: "#475569" }}>({activity.length})</span>}
          </h2>
          <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{activityOpen ? "▲" : "▼"}</span>
        </div>
        {activityOpen && (
          <div style={{ overflowX: "auto", marginTop: "1rem" }}>
            {activity.length === 0 ? (
              <p style={{ color: "#475569", fontSize: "0.82rem" }}>No warmup activity recorded yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem 0.6rem" }}>Time</th>
                    <th style={{ padding: "0.5rem 0.6rem" }}>Sender</th>
                    <th style={{ padding: "0.5rem 0.6rem" }}>Recipient</th>
                    <th style={{ padding: "0.5rem 0.6rem" }}>Subject</th>
                    <th style={{ padding: "0.5rem 0.6rem" }}>Type</th>
                    <th style={{ padding: "0.5rem 0.6rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.slice(0, 25).map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "0.5rem 0.6rem", color: "#94a3b8", whiteSpace: "nowrap" }}>{a.sent_at ? new Date(a.sent_at).toLocaleString() : "—"}</td>
                      <td style={{ padding: "0.5rem 0.6rem", fontFamily: "monospace", color: "#e2e8f0" }}>{a.sender_email}</td>
                      <td style={{ padding: "0.5rem 0.6rem", fontFamily: "monospace", color: "#94a3b8" }}>
                        {a.recipient_email}
                        {" "}
                        <RoutingBadge isExternal={isExternalEmail(a.recipient_email)} />
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject ?? "—"}</td>
                      <td style={{ padding: "0.5rem 0.6rem" }}>
                        {a.message_type && <RoutingBadge isExternal={a.message_type === "external"} />}
                      </td>
                      <td style={{ padding: "0.5rem 0.6rem" }}>
                        <span style={{ color: a.status === "sent" ? "#22c55e" : a.status === "failed" ? "#f87171" : "#64748b", fontWeight: 600 }}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Warmup ramp schedule reference */}
      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Warmup Ramp Schedule (5-Day)
        </h2>
        <div style={{ display: "flex", gap: "0", flexWrap: "wrap" }}>
          {WARMUP_RAMP.map(({ day, limit }) => {
            const isThreshold = limit >= 50;
            return (
              <div key={day} style={{
                flex: "1 1 auto",
                textAlign: "center",
                padding: "0.75rem 1rem",
                borderRight: "1px solid #0f172a",
                background: isThreshold ? "#1e3a2f" : "transparent",
                borderBottom: isThreshold ? "2px solid #22c55e" : "none",
              }}>
                <div style={{ fontSize: "0.7rem", color: "#475569", marginBottom: "0.25rem" }}>Day {day}</div>
                <div style={{ fontWeight: 700, color: isThreshold ? "#4ade80" : "#e2e8f0", fontSize: "1rem" }}>{limit}</div>
                {day === 5 && (
                  <div style={{ fontSize: "0.65rem", color: "#22c55e", marginTop: "0.2rem", fontWeight: 600 }}>Outreach</div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ color: "#475569", fontSize: "0.78rem", marginTop: "0.75rem", margin: "0.75rem 0 0" }}>
          Cold outreach unlocks at 50/day (Day 5). Warmup completes at Day 5 (50/day).
        </p>
      </div>

      {/* Email auth requirements */}
      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Domain Authentication Requirements
        </h2>
        <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1rem", margin: "0 0 0.85rem" }}>
          Warmup only works if your domain is properly authenticated. Verify these DNS records for <strong style={{ color: "#94a3b8" }}>8fold.app</strong> before starting.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {[
            { name: "SPF", desc: "Authorizes servers to send on your behalf", example: "v=spf1 include:_spf.google.com ~all" },
            { name: "DKIM", desc: "Cryptographic signature for each email", example: "Key added via your ESP (Google Workspace, etc.)" },
            { name: "DMARC", desc: "Policy for handling authentication failures", example: "v=DMARC1; p=quarantine; rua=mailto:..." },
          ].map(({ name, desc, example }) => (
            <div key={name} style={{ flex: "1 1 200px", background: "#0f172a", borderRadius: 8, padding: "0.85rem 1rem" }}>
              <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: "0.3rem", fontSize: "0.875rem" }}>{name}</div>
              <div style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: "0.4rem" }}>{desc}</div>
              <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#475569" }}>{example}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
