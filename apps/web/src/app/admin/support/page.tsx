"use client";

import React from "react";
import { apiFetch } from "@/admin/lib/api";
import { PageHeader, Card, SecondaryButton, PrimaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";
import { Badge } from "@/admin/ui/badges";
import { formatDateTime } from "@/admin/ui/format";
import Link from "next/link";

type DisputeCaseLite = {
  id: string;
  status: string;
  deadlineAt: string;
  disputeReason: string;
};

type InboxTicket = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: "HELP" | "DISPUTE";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH";
  roleContext: string;
  subject: string;
  createdById: string;
  assignedToId: string | null;
  disputeCase: DisputeCaseLite | null;
  messageCount: number;
  attachmentCount: number;
};

function toneForStatus(status: string) {
  if (status === "OPEN") return "info" as const;
  if (status === "IN_PROGRESS") return "info" as const;
  if (status === "RESOLVED") return "ok" as const;
  if (status === "CLOSED") return "neutral" as const;
  return "neutral" as const;
}

function toneForPriority(p: string) {
  if (p === "HIGH") return "warn" as const;
  return "neutral" as const;
}

function daysRemaining(deadlineAt: string): number {
  const ms = new Date(deadlineAt).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export default function SupportInboxPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [actorUserId, setActorUserId] = React.useState<string>("");
  const [tickets, setTickets] = React.useState<InboxTicket[]>([]);

  const [status, setStatus] = React.useState<string>("");
  const [type, setType] = React.useState<string>("");
  const [highPriority, setHighPriority] = React.useState(false);
  const [assignedToMe, setAssignedToMe] = React.useState(false);
  const [deadlineApproaching, setDeadlineApproaching] = React.useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (type) qs.set("type", type);
      if (highPriority) qs.set("highPriority", "true");
      if (assignedToMe) qs.set("assignedToMe", "true");
      if (deadlineApproaching) qs.set("deadlineApproaching", "true");

      const data = await apiFetch<{ actorUserId: string; tickets: InboxTicket[] }>(
        `/api/admin/support/inbox?${qs.toString()}`
      );
      setActorUserId(data.actorUserId);
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, highPriority, assignedToMe, deadlineApproaching]);

  async function assignToMe(ticketId: string) {
    try {
      await apiFetch(`/api/admin/support/tickets/${ticketId}/assign-to-me`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Support"
        title="Support Inbox"
        subtitle="Human, auditable support threads. Disputes are time-bounded (15 business days)."
        right={
          <SecondaryButton onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </SecondaryButton>
        }
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <SecondaryButton disabled>Tickets</SecondaryButton>
        <Link href="/admin/support/disputes" style={{ textDecoration: "none" }}>
          <SecondaryButton>Disputes</SecondaryButton>
        </Link>
      </div>

      {error ? (
        <Card style={{ marginBottom: 14, borderColor: AdminColors.danger }}>
          <div style={{ color: AdminColors.danger, fontWeight: 900 }}>{error}</div>
        </Card>
      ) : null}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${AdminColors.border}`,
              background: AdminColors.card,
              color: AdminColors.text,
            }}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${AdminColors.border}`,
              background: AdminColors.card,
              color: AdminColors.text,
            }}
          >
            <option value="">All types</option>
            <option value="HELP">HELP</option>
            <option value="DISPUTE">DISPUTES</option>
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center", color: AdminColors.text, fontSize: 13 }}>
            <input type="checkbox" checked={highPriority} onChange={(e) => setHighPriority(e.target.checked)} />
            High priority
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", color: AdminColors.text, fontSize: 13 }}>
            <input type="checkbox" checked={assignedToMe} onChange={(e) => setAssignedToMe(e.target.checked)} />
            Assigned to me
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", color: AdminColors.text, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={deadlineApproaching}
              onChange={(e) => setDeadlineApproaching(e.target.checked)}
            />
            Deadline approaching (disputes)
          </label>
        </div>
      </Card>

      {loading ? (
        <Card>
          <div style={{ color: AdminColors.muted }}>Loading inbox…</div>
        </Card>
      ) : tickets.length === 0 ? (
        <Card>
          <div style={{ color: AdminColors.muted }}>
            No tickets match your filters. This is not a failure condition.
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["Type", "Subject", "Status", "Priority", "Assigned", "SLA", "Activity", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 900,
                        color: AdminColors.muted,
                        padding: "12px 14px",
                        borderBottom: `1px solid ${AdminColors.divider}`,
                        background: AdminColors.card,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const isMine = Boolean(actorUserId && t.assignedToId === actorUserId);
                  const sla = t.disputeCase?.deadlineAt ? `${daysRemaining(t.disputeCase.deadlineAt)}d` : "—";
                  const href =
                    t.type === "DISPUTE" && t.disputeCase?.id
                      ? `/admin/support/disputes/${t.disputeCase.id}`
                      : `/admin/support/tickets/${t.id}`;

                  return (
                    <tr key={t.id}>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        <Badge label={t.type} tone={t.type === "DISPUTE" ? "warn" : "neutral"} />
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        <Link href={href} style={{ color: AdminColors.text, fontWeight: 900, textDecoration: "none" }}>
                          {t.subject}
                        </Link>
                        <div style={{ fontSize: 12, color: AdminColors.muted, marginTop: 6 }}>
                          {t.category} • {t.roleContext}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        <Badge label={t.status} tone={toneForStatus(t.status)} />
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        <Badge label={t.priority} tone={toneForPriority(t.priority)} />
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        {t.assignedToId ? (
                          <span style={{ color: isMine ? AdminColors.green : AdminColors.text, fontWeight: 900 }}>
                            {isMine ? "Me" : "Assigned"}
                          </span>
                        ) : (
                          <span style={{ color: AdminColors.muted }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        {t.type === "DISPUTE" && t.disputeCase ? (
                          <div>
                            <div style={{ fontWeight: 900 }}>{sla}</div>
                            <div style={{ fontSize: 12, color: AdminColors.muted }}>{t.disputeCase.status}</div>
                          </div>
                        ) : (
                          <span style={{ color: AdminColors.muted }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        <div style={{ fontSize: 12, color: AdminColors.muted }}>
                          Msg {t.messageCount} • Files {t.attachmentCount}
                        </div>
                        <div style={{ fontSize: 12, color: AdminColors.muted, marginTop: 6 }}>
                          Updated {formatDateTime(t.updatedAt)}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${AdminColors.divider}` }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {!t.assignedToId || !isMine ? (
                            <PrimaryButton onClick={() => void assignToMe(t.id)}>Assign to me</PrimaryButton>
                          ) : null}
                          <SecondaryButton onClick={() => (window.location.href = href)}>Open</SecondaryButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}

