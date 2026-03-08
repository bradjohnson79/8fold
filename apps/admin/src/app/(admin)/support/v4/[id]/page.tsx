"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

type SupportMessage = {
  id: string;
  senderUserId: string;
  senderRole: string;
  message: string;
  createdAt: string;
};

type SupportTicket = {
  id: string;
  userId: string;
  role: string;
  subject: string;
  category: string;
  ticketType?: string | null;
  status: string;
  priority: string;
  jobId?: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "rgba(96,165,250,0.9)",
  ADMIN_REPLY: "rgba(52,211,153,0.9)",
  USER_REPLY: "rgba(251,191,36,0.9)",
  RESOLVED: "rgba(148,163,184,0.7)",
  CLOSED: "rgba(100,116,139,0.6)",
};

export default function AdminSupportV4TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/v4/support/ticket/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load ticket"));
        return;
      }
      setTicket((json.data?.ticket as SupportTicket) ?? null);
      setMessages(Array.isArray(json.data?.messages) ? (json.data.messages as SupportMessage[]) : []);
    } catch {
      setError("Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const msg = reply.trim();
    if (!msg) return;
    setSending(true);
    setSendError(null);
    try {
      const resp = await fetch(`/api/admin/v4/support/ticket/${encodeURIComponent(id)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setSendError(String(json?.error?.message ?? "Failed to send reply"));
        return;
      }
      setReply("");
      await load();
    } catch {
      setSendError("Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!status) return;
    try {
      await fetch(`/api/admin/v4/support/ticket/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setNewStatus("");
      await load();
    } catch {
      /* ignore */
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading ticket...</div>;
  if (error || !ticket) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error ?? "Ticket not found."}</div>
        <Link href="/support" style={{ color: "rgba(125,211,252,0.9)", marginTop: 12, display: "inline-block" }}>← Back to Support</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {/* Left panel — ticket metadata */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <Link href="/support" style={{ color: "rgba(125,211,252,0.9)", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          ← Back to Support
        </Link>

        <div style={{ marginTop: 16, borderRadius: 12, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,23,42,0.5)", padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "rgba(226,232,240,0.95)", marginBottom: 12 }}>Ticket Info</h2>
          <MetaRow label="Status">
            <span style={{ color: STATUS_COLORS[ticket.status] ?? "inherit", fontWeight: 700 }}>
              {ticket.status.replace("_", " ")}
            </span>
          </MetaRow>
          <MetaRow label="Role">{ticket.role}</MetaRow>
          <MetaRow label="Type">{ticket.ticketType ?? ticket.category}</MetaRow>
          <MetaRow label="Priority">{ticket.priority}</MetaRow>
          {ticket.jobId ? <MetaRow label="Job ID">{ticket.jobId.slice(0, 12)}…</MetaRow> : null}
          <MetaRow label="User ID">{ticket.userId.slice(0, 12)}…</MetaRow>
          <MetaRow label="Opened">{new Date(ticket.createdAt).toLocaleDateString()}</MetaRow>
          <MetaRow label="Updated">{new Date(ticket.updatedAt).toLocaleString()}</MetaRow>
        </div>

        {/* Status update */}
        <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,23,42,0.5)", padding: 16 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "rgba(226,232,240,0.72)", marginBottom: 8 }}>Change Status</h3>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(15,23,42,0.7)",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 6,
              color: "rgba(226,232,240,0.9)",
              padding: "6px 8px",
              fontSize: 12,
            }}
          >
            <option value="">Select status…</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <button
            onClick={() => void handleStatusUpdate(newStatus)}
            disabled={!newStatus}
            style={{
              marginTop: 8,
              width: "100%",
              borderRadius: 6,
              border: "1px solid rgba(52,211,153,0.4)",
              background: "rgba(52,211,153,0.15)",
              color: "rgba(52,211,153,0.9)",
              padding: "6px 0",
              fontSize: 12,
              fontWeight: 800,
              cursor: newStatus ? "pointer" : "not-allowed",
              opacity: newStatus ? 1 : 0.5,
            }}
          >
            Update
          </button>
        </div>
      </div>

      {/* Right panel — conversation + reply */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 950, color: "rgba(226,232,240,0.98)" }}>
          {ticket.subject}
        </h1>
        <p style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.5)" }}>
          Ticket ID: {ticket.id}
        </p>

        {/* Message thread */}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m) => {
            const isAdmin = m.senderRole === "ADMIN";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: isAdmin ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "75%",
                    borderRadius: 16,
                    padding: "12px 16px",
                    background: isAdmin ? "rgba(52,211,153,0.15)" : "rgba(30,41,59,0.8)",
                    border: isAdmin ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(148,163,184,0.15)",
                  }}
                >
                  {!isAdmin && (
                    <p style={{ margin: 0, marginBottom: 4, fontSize: 11, fontWeight: 800, color: "rgba(148,163,184,0.8)" }}>
                      {m.senderRole} — {m.senderUserId.slice(0, 8)}…
                    </p>
                  )}
                  {isAdmin && (
                    <p style={{ margin: 0, marginBottom: 4, fontSize: 11, fontWeight: 800, color: "rgba(52,211,153,0.9)" }}>
                      Support Team (Admin)
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(226,232,240,0.9)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {m.message}
                  </p>
                  <p style={{ margin: 0, marginTop: 6, fontSize: 11, color: "rgba(226,232,240,0.4)", textAlign: "right" }}>
                    {new Date(m.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        {ticket.status !== "CLOSED" ? (
          <div style={{ marginTop: 20, borderRadius: 12, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,23,42,0.5)", padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 10, fontSize: 12, fontWeight: 900, color: "rgba(226,232,240,0.72)" }}>
              Reply to User
            </h3>
            {sendError ? (
              <div style={{ marginBottom: 10, borderRadius: 8, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", padding: "8px 12px", fontSize: 12, color: "rgba(254,202,202,0.9)" }}>
                {sendError}
              </div>
            ) : null}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="Type your reply to the user..."
              style={{
                width: "100%",
                background: "rgba(15,23,42,0.7)",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 8,
                color: "rgba(226,232,240,0.9)",
                padding: "10px 12px",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => void handleSend()}
                disabled={sending || !reply.trim()}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(52,211,153,0.4)",
                  background: sending || !reply.trim() ? "rgba(52,211,153,0.1)" : "rgba(52,211,153,0.2)",
                  color: "rgba(52,211,153,0.9)",
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: sending || !reply.trim() ? "not-allowed" : "pointer",
                  opacity: sending || !reply.trim() ? 0.5 : 1,
                }}
              >
                {sending ? "Sending…" : "Send Reply"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 20, borderRadius: 10, background: "rgba(15,23,42,0.4)", border: "1px solid rgba(148,163,184,0.15)", padding: 14, fontSize: 13, color: "rgba(226,232,240,0.5)", textAlign: "center" }}>
            This ticket is closed. No further replies can be sent.
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ display: "block", fontSize: 10, fontWeight: 900, color: "rgba(226,232,240,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: "rgba(226,232,240,0.85)" }}>{children}</span>
    </div>
  );
}
