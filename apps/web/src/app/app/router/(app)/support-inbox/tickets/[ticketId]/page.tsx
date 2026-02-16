"use client";

import React from "react";
import Link from "next/link";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  type: "HELP" | "DISPUTE";
  priority: string;
  category: string;
  roleContext: string;
  assignedToId: string | null;
};
type Message = { id: string; message: string; createdAt: string; authorId: string };
type Attachment = { id: string; originalName: string; sizeBytes: number; downloadUrl: string };

function getTicketId(): string {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export default function RouterSupportTicketPage() {
  const ticketId = getTicketId();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/router/support/tickets/${ticketId}`, { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load");
      setTicket(json?.ticket ?? null);
      setMessages(Array.isArray(json?.messages) ? json.messages : []);
      setAttachments(Array.isArray(json?.attachments) ? json.attachments : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!ticketId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function send() {
    if (!ticketId) return;
    const msg = draft.trim();
    if (!msg) return;
    setSending(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/router/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to send");
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Ticket</h2>
          <p className="text-gray-600 mt-2">Senior Router support workflow (placeholder).</p>
        </div>
        <Link href="/app/router/support/inbox" className="text-8fold-green hover:text-8fold-green-dark font-semibold">
          ← Back to inbox
        </Link>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : !ticket ? (
        <div className="text-gray-600">Ticket not found.</div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="font-bold text-gray-900">{ticket.subject}</div>
            <div className="text-sm text-gray-600 mt-2">
              Type: {ticket.type} · Status: {ticket.status} · Priority: {ticket.priority}
            </div>
            <div className="text-sm text-gray-600 mt-1">Category: {ticket.category} · Context: {ticket.roleContext}</div>
          </div>

          {attachments.length ? (
            <div className="border border-gray-200 rounded-2xl p-5">
              <div className="font-bold text-gray-900">Attachments</div>
              <div className="mt-3 space-y-2">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.downloadUrl}
                    className="block text-8fold-green hover:text-8fold-green-dark font-semibold"
                  >
                    {a.originalName} ({Math.round(a.sizeBytes / 1024)}kb)
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="font-bold text-gray-900">Messages</div>
            <div className="mt-3 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                  <div className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleString()}</div>
                  <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{m.message}</div>
                </div>
              ))}
              {messages.length === 0 ? <div className="text-sm text-gray-600">No messages yet.</div> : null}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a reply…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
              />
              <button
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                className="bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-4 py-2 rounded-lg"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

