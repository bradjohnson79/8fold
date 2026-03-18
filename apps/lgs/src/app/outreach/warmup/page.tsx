"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type WarmupSender = {
  id: string;
  email: string;
  sender_status: string;
  warmup_status: string;
  dashboard_status: string;
  warmup_day: number;
  daily_limit: number;
  sent_today: number;
  warmup_sent_today: number;
  outreach_sent_today: number;
  remaining_capacity: number;
  current_day_started_at: string | null;
  next_warmup_send_at: string | null;
  next_send_state: string;
  last_warmup_sent_at: string | null;
  last_warmup_result: string | null;
  last_warmup_recipient: string | null;
  last_activity_at: string | null;
  last_activity_status: string | null;
  last_activity_recipient: string | null;
  last_activity_type: string | null;
  last_activity_error: string | null;
  is_ready_for_outreach: boolean;
  outreach_enabled: boolean;
  consecutive_failures: number;
  health_score: string | null;
  cooldown_until: string | null;
  is_cooling_down: boolean;
};

type WarmupSummary = {
  total_senders: number;
  warming_senders: number;
  ready_senders: number;
  outreach_enabled_count: number;
  pending_queue_count: number;
  next_system_warmup_send_at: string | null;
  last_warmup_activity_at: string | null;
  last_warmup_activity: {
    sender_email: string;
    recipient_email: string;
    message_type: string | null;
    status: string;
    error_message: string | null;
    sent_at: string | null;
  } | null;
  worker_last_heartbeat_at: string | null;
  worker_last_run_started_at: string | null;
  worker_last_run_finished_at: string | null;
  worker_last_run_status: string | null;
  worker_status: string;
  schedule: Record<string, number>;
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
  not_started: "#475569",
  warming: "#f59e0b",
  ready: "#22c55e",
  paused: "#94a3b8",
  error: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  warming: "Warming",
  ready: "Ready",
  paused: "Paused",
  error: "Error",
};

const WORKER_STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  warning: "#f59e0b",
  stale: "#ef4444",
};

const RESULT_COLORS: Record<string, string> = {
  sent: "#22c55e",
  failed: "#ef4444",
  error: "#ef4444",
  skipped: "#facc15",
  wait: "#f59e0b",
};

const HEALTH_COLORS: Record<string, string> = {
  good: "#22c55e",
  warning: "#f59e0b",
  risk: "#ef4444",
  unknown: "#94a3b8",
};

const HEALTH_LABELS: Record<string, string> = {
  good: "Healthy",
  warning: "Watch",
  risk: "Risk",
  unknown: "Insufficient activity",
};

function formatClockTime(iso: string | null): string {
  if (!iso) return "No persisted schedule";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "No timestamp recorded";
  return new Date(iso).toLocaleString();
}

function formatRelativeTime(iso: string | null, fallback: string): string {
  if (!iso) return fallback;

  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "0m ago";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatCountdown(target: string | null, fallback: string): string {
  if (!target) return fallback;

  const diff = Math.max(0, new Date(target).getTime() - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

function useCountdown(target: string | null, fallback: string): string {
  const [display, setDisplay] = useState(() => formatCountdown(target, fallback));

  useEffect(() => {
    setDisplay(formatCountdown(target, fallback));
    const id = setInterval(() => {
      setDisplay(formatCountdown(target, fallback));
    }, 1000);
    return () => clearInterval(id);
  }, [fallback, target]);

  return display;
}

function HealthBadge({ score }: { score: string | null }) {
  if (!score) return null;
  const color = HEALTH_COLORS[score] ?? "#94a3b8";
  const label = HEALTH_LABELS[score] ?? score;

  return (
    <span
      style={{
        padding: "0.15rem 0.55rem",
        borderRadius: 999,
        fontSize: "0.72rem",
        fontWeight: 700,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      style={{
        padding: "0.2rem 0.65rem",
        borderRadius: 999,
        fontSize: "0.74rem",
        fontWeight: 700,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function TypeBadge({ value }: { value: string | null }) {
  const label = value === "external" ? "External" : value === "internal" ? "Internal" : "System";
  const color = value === "external" ? "#38bdf8" : value === "internal" ? "#a78bfa" : "#94a3b8";

  return (
    <span
      style={{
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        fontSize: "0.7rem",
        fontWeight: 700,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color = "#f8fafc",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: "1rem 1.1rem", border: "1px solid #334155" }}>
      <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.35rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.35rem" }}>{sub}</div>}
    </div>
  );
}

function SenderMetric({ label, value, accent = "#f8fafc" }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: "0.8rem 0.9rem", border: "1px solid #1e293b" }}>
      <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1rem", fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function getSenderCountdownFallback(sender: WarmupSender): string {
  switch (sender.next_send_state) {
    case "complete_for_day":
      return "Complete for day";
    case "blocked":
      return "Blocked by cooldown";
    case "paused":
      return "Warmup paused";
    case "missing_schedule":
      return "Schedule missing";
    default:
      return "No active warmup";
  }
}

function getSenderScheduleDetail(sender: WarmupSender): string {
  switch (sender.next_send_state) {
    case "scheduled":
      return `Scheduled: ${formatClockTime(sender.next_warmup_send_at)}`;
    case "complete_for_day":
      return "Warmup budget is fully used for the current day.";
    case "blocked":
      return sender.cooldown_until
        ? `Cooldown until ${formatDateTime(sender.cooldown_until)}`
        : "Sending is blocked until cooldown clears.";
    case "paused":
      return "Resume warmup to persist a new send time.";
    case "missing_schedule":
      return "Worker has not persisted the next send time yet.";
    default:
      return "Start warmup to persist the first send time.";
  }
}

function getSystemCountdownFallback(senders: WarmupSender[]): string {
  if (senders.length === 0) return "No senders configured";

  const activeSenders = senders.filter((sender) =>
    sender.warmup_status === "warming" ||
    sender.warmup_status === "ready" ||
    sender.warmup_status === "paused"
  );

  if (activeSenders.length === 0) return "No active warmup";
  if (activeSenders.every((sender) => sender.next_send_state === "paused")) return "Warmup paused";
  if (activeSenders.some((sender) => sender.next_send_state === "missing_schedule")) return "Schedule missing";
  if (activeSenders.some((sender) => sender.next_send_state === "blocked")) return "Blocked by cooldown";
  if (activeSenders.every((sender) => sender.next_send_state === "complete_for_day")) return "Complete for day";
  return "No persisted schedule";
}

function WarmupProgressCard({
  sender,
  onAction,
}: {
  sender: WarmupSender;
  onAction: (id: string, action: string) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const countdownFallback = getSenderCountdownFallback(sender);
  const nextWarmupCountdown = useCountdown(sender.next_warmup_send_at, countdownFallback);
  const dayProgress = Math.max(0, Math.min(sender.warmup_day, 5));
  const dayProgressPct = (dayProgress / 5) * 100;
  const borderColor = STATUS_COLORS[sender.dashboard_status] ?? "#334155";
  const lastActivityLabel = sender.last_activity_status
    ? `${sender.last_activity_status.charAt(0).toUpperCase()}${sender.last_activity_status.slice(1)} • ${formatRelativeTime(sender.last_activity_at, "No activity timestamp")}`
    : "No warmup activity detected";
  const lastVerifiedSendLabel = sender.last_warmup_sent_at
    ? `Verified send • ${formatRelativeTime(sender.last_warmup_sent_at, "No send timestamp")}`
    : "No verified send recorded";
  const readinessTitle = sender.is_ready_for_outreach || sender.outreach_enabled
    ? "Outreach enabled"
    : "Outreach disabled - warmup incomplete";
  const readinessSub = sender.is_ready_for_outreach || sender.outreach_enabled
    ? "Sender meets Day 5 and 50 emails/day readiness."
    : "Minimum: Day 5 (50 emails/day)";

  async function act(action: string) {
    setActing(true);
    try {
      await onAction(sender.id, action);
    } finally {
      setActing(false);
    }
  }

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 14,
        padding: "1.25rem",
        border: `1px solid ${borderColor}55`,
        boxShadow: "0 10px 30px rgba(2, 6, 23, 0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "0.95rem", color: "#f8fafc", fontWeight: 700 }}>{sender.email}</div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.25rem" }}>Sender status: {sender.sender_status}</div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status={sender.dashboard_status} />
          <HealthBadge score={sender.health_score} />
        </div>
      </div>

      {(sender.last_activity_status === "failed" || sender.consecutive_failures > 0) && (
        <div style={{ marginBottom: "0.9rem", padding: "0.75rem 0.9rem", borderRadius: 10, background: "#3b1a1a", border: "1px solid #7f1d1d", color: "#fecaca" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>
            Failure state detected
          </div>
          <div style={{ fontSize: "0.82rem" }}>
            {sender.consecutive_failures} consecutive failed or skipped warmup attempts.
            {sender.last_activity_error ? ` ${sender.last_activity_error}` : ""}
          </div>
        </div>
      )}

      {sender.is_cooling_down && (
        <div style={{ marginBottom: "0.9rem", padding: "0.75rem 0.9rem", borderRadius: 10, background: "#312e15", border: "1px solid #854d0e", color: "#fde68a" }}>
          Cooldown active. Sending resumes only after the persisted cooldown timestamp clears.
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
          <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Day: {sender.warmup_day} / 5</span>
          <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Progress</span>
        </div>
        <div style={{ background: "#0f172a", borderRadius: 999, height: 10, overflow: "hidden" }}>
          <div
            style={{
              width: `${dayProgressPct}%`,
              height: "100%",
              background: sender.is_ready_for_outreach ? "#22c55e" : "#f59e0b",
              transition: "width 0.2s linear",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <SenderMetric label="Daily Limit" value={`${sender.daily_limit}`} />
        <SenderMetric label="Sent Today" value={`${sender.sent_today} / ${sender.daily_limit}`} />
        <SenderMetric label="Warmup Sends" value={`${sender.warmup_sent_today}`} accent="#f59e0b" />
        <SenderMetric label="Outreach Sends" value={`${sender.outreach_sent_today}`} accent="#38bdf8" />
      </div>

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
        <div style={{ background: "#0f172a", borderRadius: 10, padding: "0.85rem 0.9rem", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Send</span>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: sender.next_warmup_send_at ? "#f59e0b" : "#f8fafc", fontVariantNumeric: "tabular-nums" }}>
              {nextWarmupCountdown}
            </span>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#94a3b8" }}>{getSenderScheduleDetail(sender)}</div>
        </div>

        <div style={{ background: "#0f172a", borderRadius: 10, padding: "0.85rem 0.9rem", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
            Last Activity
          </div>
          <div style={{ fontSize: "0.92rem", color: "#f8fafc", fontWeight: 700 }}>{lastActivityLabel}</div>
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.35rem", color: "#94a3b8", fontSize: "0.82rem" }}>
            {sender.last_activity_type && <TypeBadge value={sender.last_activity_type} />}
            <span>
              {sender.last_activity_recipient
                ? `${sender.last_activity_type ?? "target"} -> ${sender.last_activity_recipient}`
                : "Check worker or sender configuration"}
            </span>
          </div>
        </div>

        <div style={{ background: "#0f172a", borderRadius: 10, padding: "0.85rem 0.9rem", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
            Last Verified Send
          </div>
          <div style={{ fontSize: "0.92rem", color: "#f8fafc", fontWeight: 700 }}>{lastVerifiedSendLabel}</div>
          <div style={{ marginTop: "0.35rem", fontSize: "0.82rem", color: "#94a3b8" }}>
            {sender.last_warmup_recipient
              ? `${sender.last_warmup_result ?? "sent"} -> ${sender.last_warmup_recipient}`
              : "No recipient persisted yet"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginBottom: "1rem",
          padding: "0.85rem 0.9rem",
          borderRadius: 10,
          background: sender.is_ready_for_outreach || sender.outreach_enabled ? "#173327" : "#3b1a1a",
          border: sender.is_ready_for_outreach || sender.outreach_enabled ? "1px solid #166534" : "1px solid #7f1d1d",
        }}
      >
        <div style={{ fontSize: "0.92rem", color: sender.is_ready_for_outreach || sender.outreach_enabled ? "#86efac" : "#fecaca", fontWeight: 800 }}>
          {readinessTitle}
        </div>
        <div style={{ marginTop: "0.2rem", color: sender.is_ready_for_outreach || sender.outreach_enabled ? "#bbf7d0" : "#fca5a5", fontSize: "0.82rem" }}>
          {readinessSub}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
        {sender.warmup_status === "not_started" && (
          <button
            onClick={() => void act("start")}
            disabled={acting}
            style={{ padding: "0.45rem 0.95rem", background: "#f59e0b", border: "none", borderRadius: 8, color: "#0f172a", fontWeight: 700, cursor: acting ? "not-allowed" : "pointer" }}
          >
            {acting ? "Starting..." : "Start Warmup"}
          </button>
        )}
        {sender.warmup_status === "warming" && (
          <>
            <button
              onClick={() => void act("pause")}
              disabled={acting}
              style={{ padding: "0.45rem 0.95rem", background: "#334155", border: "1px solid #475569", borderRadius: 8, color: "#e2e8f0", cursor: acting ? "not-allowed" : "pointer" }}
            >
              Pause
            </button>
            <button
              onClick={() => void act("advance")}
              disabled={acting}
              style={{ padding: "0.45rem 0.95rem", background: "#0f172a", border: "1px solid #475569", borderRadius: 8, color: "#cbd5e1", cursor: acting ? "not-allowed" : "pointer" }}
            >
              Advance Day
            </button>
          </>
        )}
        {sender.warmup_status === "paused" && (
          <button
            onClick={() => void act("start")}
            disabled={acting}
            style={{ padding: "0.45rem 0.95rem", background: "#f59e0b", border: "none", borderRadius: 8, color: "#0f172a", fontWeight: 700, cursor: acting ? "not-allowed" : "pointer" }}
          >
            {acting ? "Resuming..." : "Resume"}
          </button>
        )}
        {(sender.warmup_status === "warming" || sender.warmup_status === "paused" || sender.warmup_status === "ready") && (
          <button
            onClick={() => void act("reset")}
            disabled={acting}
            style={{ padding: "0.45rem 0.95rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#cbd5e1", cursor: acting ? "not-allowed" : "pointer" }}
          >
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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const [warmupRes, activityRes, healthRes] = await Promise.all([
        fetch("/api/lgs/outreach/warmup", { cache: "no-store" }),
        fetch("/api/lgs/outreach/warmup/activity", { cache: "no-store" }),
        fetch("/api/lgs/outreach/warmup/health", { cache: "no-store" }),
      ]);

      const warmupJson = await warmupRes.json();
      const activityJson = await activityRes.json().catch(() => ({ ok: false }));
      const healthJson = await healthRes.json().catch(() => ({ ok: false }));

      if (!warmupJson.ok) {
        throw new Error(warmupJson.error ?? "Failed to load warmup data");
      }

      setSenders(warmupJson.data ?? []);
      setSummary(warmupJson.summary ?? null);
      setActivity(activityJson.ok ? activityJson.data ?? [] : []);
      setHealth(healthJson.ok ? healthJson.data ?? null : null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const systemCountdownFallback = useMemo(() => getSystemCountdownFallback(senders), [senders]);
  const systemCountdown = useCountdown(summary?.next_system_warmup_send_at ?? null, systemCountdownFallback);
  const workerStatusColor = WORKER_STATUS_COLORS[summary?.worker_status ?? "stale"] ?? "#ef4444";
  const lastActivityValue = summary?.last_warmup_activity_at
    ? formatRelativeTime(summary.last_warmup_activity_at, "No activity timestamp")
    : "No warmup activity detected";
  const lastActivitySub = summary?.last_warmup_activity
    ? `${summary.last_warmup_activity.sender_email} -> ${summary.last_warmup_activity.recipient_email}`
    : "Check worker or sender configuration";
  const workerStatusValue = summary
    ? `${(summary.worker_status.charAt(0).toUpperCase() + summary.worker_status.slice(1))} • ${
        summary.worker_last_run_finished_at
          ? `last run ${formatRelativeTime(summary.worker_last_run_finished_at, "No run timestamp")}`
          : "No worker run recorded"
      }`
    : "Loading worker state";
  const heartbeatValue = summary?.worker_last_heartbeat_at
    ? formatRelativeTime(summary.worker_last_heartbeat_at, "No heartbeat recorded")
    : "No heartbeat recorded";

  return (
    <div style={{ maxWidth: 1120 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Email Warmup</h1>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: "0.92rem", maxWidth: 760 }}>
            Real-time operational dashboard for warmup timing, verified send activity, per-sender progression, and worker health.
          </p>
        </div>
        <Link
          href="/settings/senders"
          style={{ padding: "0.55rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, fontSize: "0.875rem", color: "#cbd5e1", textDecoration: "none" }}
        >
          Manage Senders
        </Link>
      </div>

      {err && (
        <div style={{ marginBottom: "1rem", padding: "0.85rem 0.95rem", borderRadius: 10, background: "#3b1a1a", border: "1px solid #7f1d1d", color: "#fecaca" }}>
          {err}
        </div>
      )}

      {summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <SummaryCard
              label="Next System Warmup Send"
              value={systemCountdown}
              sub={summary.next_system_warmup_send_at ? `Scheduled: ${formatClockTime(summary.next_system_warmup_send_at)}` : systemCountdownFallback}
              color={summary.next_system_warmup_send_at ? "#f59e0b" : "#f8fafc"}
            />
            <SummaryCard
              label="Last Warmup Activity"
              value={lastActivityValue}
              sub={lastActivitySub}
              color={summary.last_warmup_activity_at ? "#f8fafc" : "#fca5a5"}
            />
            <SummaryCard
              label="Worker Status"
              value={workerStatusValue}
              sub={summary.worker_last_run_status ? `Run status: ${summary.worker_last_run_status}` : "Run status not recorded yet"}
              color={workerStatusColor}
            />
            <SummaryCard
              label="Last Heartbeat"
              value={heartbeatValue}
              sub={summary.worker_last_heartbeat_at ? formatDateTime(summary.worker_last_heartbeat_at) : "Worker heartbeat missing"}
              color={summary.worker_last_heartbeat_at ? "#f8fafc" : "#fca5a5"}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem", marginBottom: "1rem" }}>
            <SummaryCard label="Total Senders" value={summary.total_senders} />
            <SummaryCard label="Warming Senders" value={summary.warming_senders} color="#f59e0b" />
            <SummaryCard label="Ready Senders" value={summary.ready_senders} color="#22c55e" />
            <SummaryCard label="Outreach Enabled" value={summary.outreach_enabled_count} color="#22c55e" />
            <SummaryCard label="Queue Pending" value={summary.pending_queue_count} color="#38bdf8" />
          </div>

          <div
            style={{
              marginBottom: "1.5rem",
              padding: "1rem 1.1rem",
              borderRadius: 12,
              background: summary.ready_senders > 0 ? "#173327" : "#3b1a1a",
              border: summary.ready_senders > 0 ? "1px solid #166534" : "1px solid #7f1d1d",
            }}
          >
            <div style={{ fontWeight: 800, color: summary.ready_senders > 0 ? "#86efac" : "#fecaca", marginBottom: "0.2rem" }}>
              {summary.ready_senders > 0 ? "Outreach enabled" : "Outreach disabled - warmup incomplete"}
            </div>
            <div style={{ fontSize: "0.85rem", color: summary.ready_senders > 0 ? "#bbf7d0" : "#fca5a5" }}>
              {summary.ready_senders > 0
                ? `${summary.ready_senders} sender${summary.ready_senders === 1 ? "" : "s"} currently meet Day 5 and 50 emails/day readiness.`
                : "Minimum: Day 5 (50 emails/day)"}
            </div>
          </div>
        </>
      )}

      {loading ? (
        <div style={{ color: "#94a3b8", marginBottom: "2rem" }}>Loading warmup state...</div>
      ) : senders.length === 0 ? (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: "2rem", textAlign: "center", border: "1px solid #334155", marginBottom: "2rem" }}>
          <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>No senders configured.</p>
          <Link href="/settings/senders" style={{ color: "#38bdf8" }}>
            Configure senders
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem", marginBottom: "2rem" }}>
          {senders.map((sender) => (
            <WarmupProgressCard key={sender.id} sender={sender} onAction={handleAction} />
          ))}
        </div>
      )}

      <div style={{ background: "#1e293b", borderRadius: 14, padding: "1.25rem", marginBottom: "2rem", border: "1px solid #334155" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Warmup Activity
        </h2>
        {activity.length === 0 ? (
          <div style={{ color: "#fca5a5", fontSize: "0.9rem" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>No warmup activity detected</div>
            <div>Check worker or sender configuration</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Time</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Sender</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Recipient</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Type</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #0f172a" }}>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                      {formatDateTime(entry.sent_at)}
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#f8fafc", fontFamily: "monospace" }}>{entry.sender_email}</td>
                    <td style={{ padding: "0.65rem 0.5rem", color: "#cbd5e1", fontFamily: "monospace" }}>{entry.recipient_email}</td>
                    <td style={{ padding: "0.65rem 0.5rem" }}>
                      <TypeBadge value={entry.message_type} />
                    </td>
                    <td style={{ padding: "0.65rem 0.5rem" }}>
                      <span style={{ color: RESULT_COLORS[entry.status] ?? "#f8fafc", fontWeight: 800 }}>
                        {entry.status}
                      </span>
                      {entry.error_message && (
                        <div style={{ color: "#fca5a5", fontSize: "0.74rem", marginTop: "0.2rem" }}>{entry.error_message}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {health && (
        <div style={{ background: "#1e293b", borderRadius: 14, padding: "1.25rem", border: "1px solid #334155" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Worker Health Verification
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: WORKER_STATUS_COLORS[health.heartbeat_status] ?? "#ef4444" }} />
            <span style={{ color: WORKER_STATUS_COLORS[health.heartbeat_status] ?? "#ef4444", fontWeight: 800 }}>
              {health.heartbeat_status === "healthy" ? "Healthy" : health.heartbeat_status === "warning" ? "Warning" : "Stale"}
            </span>
            <span style={{ color: "#94a3b8" }}>
              {health.pass_count}/{health.checks.length} checks passing
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            <SenderMetric label="Last Heartbeat" value={formatRelativeTime(health.worker?.last_heartbeat_at ?? null, "No heartbeat recorded")} />
            <SenderMetric label="Last Run Started" value={health.worker?.last_run_started_at ? formatDateTime(health.worker.last_run_started_at) : "No run start recorded"} />
            <SenderMetric label="Last Run Finished" value={health.worker?.last_run_finished_at ? formatDateTime(health.worker.last_run_finished_at) : "No run finish recorded"} />
            <SenderMetric label="Run Status" value={health.worker?.last_run_status ?? "No run status recorded"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.55rem" }}>
            {health.checks.map((check) => (
              <div key={check.name} style={{ padding: "0.7rem 0.8rem", borderRadius: 10, background: "#0f172a", border: "1px solid #1e293b", color: check.pass ? "#86efac" : "#fecaca" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.15rem" }}>{check.pass ? "Pass" : "Fail"}</div>
                <div style={{ fontSize: "0.8rem" }}>{check.name.replace(/_/g, " ")}</div>
              </div>
            ))}
          </div>

          {health.worker?.last_error && (
            <div style={{ marginTop: "1rem", padding: "0.8rem 0.9rem", borderRadius: 10, background: "#3b1a1a", border: "1px solid #7f1d1d", color: "#fecaca" }}>
              Last worker error: {health.worker.last_error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
