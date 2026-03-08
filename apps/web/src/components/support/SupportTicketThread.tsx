"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type SupportMessage = {
  id: string;
  senderUserId: string;
  senderRole: string;
  message: string;
  createdAt: string;
};

type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  ticketType: string | null;
  status: string;
  priority: string;
  jobId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  ADMIN_REPLY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  USER_REPLY: "bg-amber-50 text-amber-700 border-amber-200",
  RESOLVED: "bg-slate-50 text-slate-600 border-slate-200",
  CLOSED: "bg-slate-100 text-slate-500 border-slate-200",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function SupportTicketThread({ ticketId }: { ticketId: string }) {
  const { getToken } = useAuth();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(`/api/web/v4/support/ticket/${encodeURIComponent(ticketId)}`, getToken);
      const data = await resp.json().catch(() => ({})) as { ticket?: SupportTicket; messages?: SupportMessage[]; error?: { message?: string } | string };
      if (!resp.ok) {
        setError(typeof data.error === "string" ? data.error : data.error?.message ?? "Failed to load ticket");
        return;
      }
      setTicket(data.ticket ?? null);
      setMessages(data.messages ?? []);
    } catch {
      setError("Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId, getToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = reply.trim();
    if (!msg) return;
    setSending(true);
    setSendError(null);
    try {
      const resp = await apiFetch(
        `/api/web/v4/support/ticket/${encodeURIComponent(ticketId)}/reply`,
        getToken,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) },
      );
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({})) as { error?: { message?: string } | string };
        setSendError(typeof d.error === "string" ? d.error : d.error?.message ?? "Failed to send reply");
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

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading ticket...</div>;
  }
  if (error || !ticket) {
    return <div className="p-6 rounded-xl bg-rose-50 text-rose-700 text-sm">{error ?? "Ticket not found."}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ticket header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{ticket.subject}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {ticket.ticketType ?? ticket.category} &middot; Priority: {ticket.priority}
              {ticket.jobId ? ` · Job: ${ticket.jobId.slice(0, 8)}…` : ""}
            </p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Opened {new Date(ticket.createdAt).toLocaleString()} &middot; Last updated {new Date(ticket.updatedAt).toLocaleString()}
        </p>
      </div>

      {/* Message thread */}
      <div className="flex flex-col gap-3">
        {messages.map((m) => {
          const isAdmin = m.senderRole === "ADMIN";
          return (
            <div key={m.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                  isAdmin
                    ? "bg-slate-800 text-slate-100"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {isAdmin && (
                  <p className="mb-1 text-xs font-semibold text-emerald-400">Support Team</p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.message}</p>
                <p className="mt-1 text-right text-xs opacity-60">
                  {new Date(m.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box (only if not resolved/closed) */}
      {ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" ? (
        <form onSubmit={(e) => void handleSend(e)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {sendError ? (
            <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{sendError}</div>
          ) : null}
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Your reply</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Type your reply..."
          />
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          This ticket is {ticket.status.toLowerCase()}. No further replies are possible.
        </div>
      )}
    </div>
  );
}
