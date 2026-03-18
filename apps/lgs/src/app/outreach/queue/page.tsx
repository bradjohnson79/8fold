"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type QueueItem = {
  id: string;
  lead_id: string;
  outreach_message_id: string;
  sender_account: string | null;
  send_status: string;
  sent_at: string | null;
  attempts: number;
  error_message: string | null;
  created_at: string;
  subject: string | null;
  message_type: string;
  lead_email: string;
  business_name: string | null;
  trade: string | null;
  city: string | null;
  lead_score: number;
  lead_priority: string;
  outreach_stage: string;
  followup_count: number;
  reason_codes: string[];
  is_ready: boolean;
};

type QueueSummary = {
  pending: number;
  sent: number;
  failed: number;
  capacity_used: number;
  capacity_total: number;
  capacity_remaining: number;
  min_score_threshold: number;
};

type QueueResponse = {
  ok: boolean;
  summary: QueueSummary;
  data: QueueItem[];
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_REASON_LABELS: Record<string, string> = {
  priority_high: "High Priority",
  priority_medium: "Medium Priority",
  priority_low: "Low Priority",
  sender_capacity_ok: "Capacity Available",
  blocked_no_capacity: "Blocked: No Capacity",
  blocked_domain_cooldown: "Blocked: Domain Cooldown",
  blocked_sender_health: "Blocked: Sender Health",
  blocked_stage_replied: "Blocked: Lead Replied",
  blocked_stage_converted: "Blocked: Lead Converted",
  blocked_stage_paused: "Blocked: Lead Paused",
  blocked_stage_archived: "Blocked: Lead Archived",
  blocked_score_threshold: "Blocked: Score Too Low",
  send_window_closed: "Blocked: Outside Send Window",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#3b82f6",
  low: "#94a3b8",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  sent: "#22c55e",
  failed: "#ef4444",
};

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "#64748b";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
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

function StatusIndicator({ status, isReady }: { status: string; isReady: boolean }) {
  let color = STATUS_COLORS[status] ?? "#64748b";
  let label = status.charAt(0).toUpperCase() + status.slice(1);

  if (status === "pending") {
    if (isReady) { color = "#22c55e"; label = "Ready"; }
    else { color = "#f59e0b"; label = "Waiting"; }
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color, display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function ReasonPills({ codes }: { codes: string[] }) {
  const blockedCodes = codes.filter((c) => c.startsWith("blocked_"));
  const readyCodes = codes.filter((c) => !c.startsWith("blocked_") && c !== "sender_capacity_ok");
  const capacityOk = codes.includes("sender_capacity_ok");

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {readyCodes.map((c) => (
        <span key={c} style={{ fontSize: 10, color: "#64748b", background: "#1e293b", border: "1px solid #334155", borderRadius: 3, padding: "1px 5px" }}>
          {QUEUE_REASON_LABELS[c] ?? c}
        </span>
      ))}
      {capacityOk && (
        <span style={{ fontSize: 10, color: "#22c55e", background: "#22c55e11", border: "1px solid #22c55e33", borderRadius: 3, padding: "1px 5px" }}>
          Capacity OK
        </span>
      )}
      {blockedCodes.map((c) => (
        <span key={c} style={{ fontSize: 10, color: "#f59e0b", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 3, padding: "1px 5px" }}>
          {QUEUE_REASON_LABELS[c] ?? c}
        </span>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [blockedReasonFilter, setBlockedReasonFilter] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    lgsFetch<QueueResponse>(`/api/lgs/outreach/queue${q}`)
      .then((r) => {
        const res = r as unknown as QueueResponse;
        if (res.ok) {
          setItems(res.data ?? []);
          setSummary(res.summary ?? null);
          setLastUpdated(new Date());
        } else {
          setErr(res.error ?? "Failed to load queue");
        }
      })
      .catch((e) => setErr(String(e)));
  }, [statusFilter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [load]);

  // Client-side filter for blocked reason
  const displayedItems = blockedReasonFilter
    ? items.filter((item) => item.reason_codes.some((c) => c.includes(blockedReasonFilter)))
    : items;

  if (err) {
    return (
      <div>
        <h1>Outreach Queue</h1>
        <p style={{ color: "#f87171" }}>{err}</p>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>← Back</Link>
      </div>
    );
  }

  const capPct = summary && summary.capacity_total > 0
    ? Math.round((summary.capacity_used / summary.capacity_total) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Outreach Queue</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: 13 }}>
            LGS intelligent send queue
            {lastUpdated && <span style={{ marginLeft: 8 }}>· Updated {lastUpdated.toLocaleTimeString()}</span>}
          </p>
        </div>
        <Link href="/outreach/brain" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>
          Brain Dashboard →
        </Link>
      </div>

      {/* ── Queue Intelligence Summary Bar ────────────────────────────────── */}
      {summary && (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "1.25rem",
            padding: "0.875rem 1rem",
            background: "#1e293b",
            borderRadius: 8,
            border: "1px solid #334155",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", flex: 1 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>PENDING</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{summary.pending}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>SENT TODAY</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>{summary.sent}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>FAILED</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: summary.failed > 0 ? "#ef4444" : "#475569" }}>
                {summary.failed}
              </div>
            </div>
            <div style={{ borderLeft: "1px solid #334155", paddingLeft: "1rem" }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>SYSTEM CAPACITY</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: capPct > 90 ? "#ef4444" : "#f1f5f9" }}>
                {summary.capacity_used} / {summary.capacity_total}
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400, marginLeft: 6 }}>used</span>
              </div>
              <div style={{ marginTop: 4, height: 4, background: "#334155", borderRadius: 2, width: 120, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, capPct)}%`,
                    background: capPct > 90 ? "#ef4444" : capPct > 70 ? "#f59e0b" : "#22c55e",
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>REMAINING TODAY</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: summary.capacity_remaining > 0 ? "#22c55e" : "#ef4444" }}>
                {summary.capacity_remaining}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {["", "pending", "sent", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "0.4rem 0.875rem",
              background: statusFilter === s ? "#334155" : "#1e293b",
              border: `1px solid ${statusFilter === s ? "#475569" : "#334155"}`,
              borderRadius: 6,
              cursor: "pointer",
              color: statusFilter === s ? "#f1f5f9" : "#94a3b8",
              fontSize: 13,
            }}
          >
            {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}

        {/* Blocked reason filter */}
        <select
          value={blockedReasonFilter}
          onChange={(e) => setBlockedReasonFilter(e.target.value)}
          style={{
            marginLeft: "0.5rem",
            padding: "0.4rem 0.75rem",
            background: blockedReasonFilter ? "#f59e0b22" : "#1e293b",
            border: blockedReasonFilter ? "1px solid #f59e0b55" : "1px solid #334155",
            borderRadius: 6,
            color: "#e2e8f0",
            fontSize: 13,
          }}
        >
          <option value="">All (Blocked Reason)</option>
          <option value="no_capacity">Blocked: Capacity</option>
          <option value="domain_cooldown">Blocked: Domain Cooldown</option>
          <option value="sender_health">Blocked: Sender Health</option>
          <option value="stage">Blocked: Stage</option>
          <option value="score_threshold">Blocked: Score</option>
        </select>

        {(statusFilter || blockedReasonFilter) && (
          <button
            onClick={() => { setStatusFilter(""); setBlockedReasonFilter(""); }}
            style={{ padding: "0.4rem 0.75rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}
          >
            Clear
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>
          {displayedItems.length} items
        </span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
              <th style={{ textAlign: "left", padding: "0.6rem 0.75rem" }}>Business</th>
              <th style={{ textAlign: "left", padding: "0.6rem 0.5rem" }}>Subject</th>
              <th style={{ textAlign: "center", padding: "0.6rem 0.5rem" }}>Score</th>
              <th style={{ textAlign: "center", padding: "0.6rem 0.5rem" }}>Priority</th>
              <th style={{ textAlign: "left", padding: "0.6rem 0.5rem" }}>Type</th>
              <th style={{ textAlign: "left", padding: "0.6rem 0.5rem" }}>Status</th>
              <th style={{ textAlign: "left", padding: "0.6rem 0.5rem" }}>Sender</th>
              <th style={{ textAlign: "left", padding: "0.6rem 0.5rem" }}>Reason</th>
              <th style={{ textAlign: "left", padding: "0.6rem 0.5rem" }}>Queued</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.map((item) => (
              <tr
                key={item.id}
                style={{
                  borderBottom: "1px solid #1e293b",
                  opacity: item.send_status === "failed" ? 0.75 : 1,
                }}
              >
                <td style={{ padding: "0.6rem 0.75rem" }}>
                  <div style={{ color: "#f1f5f9", fontWeight: 500 }}>
                    {item.business_name ?? "—"}
                  </div>
                  <div style={{ color: "#475569", fontSize: 11, fontFamily: "monospace" }}>
                    {item.lead_email}
                  </div>
                  {item.city && (
                    <div style={{ color: "#475569", fontSize: 11 }}>
                      {item.city}
                    </div>
                  )}
                </td>
                <td style={{ padding: "0.6rem 0.5rem", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#94a3b8" }}>
                  {item.subject ?? "—"}
                </td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                  <span style={{
                    fontWeight: 600,
                    color: item.lead_score >= 80 ? "#22c55e" : item.lead_score >= 55 ? "#3b82f6" : "#94a3b8",
                  }}>
                    {item.lead_score}
                  </span>
                </td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                  <PriorityBadge priority={item.lead_priority} />
                </td>
                <td style={{ padding: "0.6rem 0.5rem" }}>
                  <span style={{ fontSize: 11, color: "#64748b", background: "#1e293b", border: "1px solid #334155", borderRadius: 3, padding: "1px 5px" }}>
                    {item.message_type.replace(/_/g, " ")}
                  </span>
                </td>
                <td style={{ padding: "0.6rem 0.5rem" }}>
                  <StatusIndicator status={item.send_status} isReady={item.is_ready} />
                  {item.error_message && (
                    <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.error_message}
                    </div>
                  )}
                </td>
                <td style={{ padding: "0.6rem 0.5rem", fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>
                  {item.sender_account
                    ? item.sender_account.split("@")[0] + "@"
                    : item.send_status === "pending" ? "Unassigned" : "—"}
                </td>
                <td style={{ padding: "0.6rem 0.5rem", minWidth: 140 }}>
                  <ReasonPills codes={item.reason_codes} />
                </td>
                <td style={{ padding: "0.6rem 0.5rem", color: "#475569", fontSize: 11, whiteSpace: "nowrap" }}>
                  {item.created_at
                    ? new Date(item.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                    : "—"}
                  {item.sent_at && (
                    <div>
                      Sent: {new Date(item.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayedItems.length === 0 && !err && (
        <p style={{ color: "#94a3b8", marginTop: "1rem" }}>
          No queue items match the current filter.
        </p>
      )}

      <p style={{ marginTop: "2rem" }}>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>← Back to Outreach</Link>
      </p>
    </div>
  );
}
