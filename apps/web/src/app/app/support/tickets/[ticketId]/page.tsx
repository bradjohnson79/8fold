"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function supportBase(pathname: string): string {
  const idx = pathname.indexOf("/support");
  if (idx < 0) return "/app/support";
  return pathname.slice(0, idx) + "/support";
}

type Ticket = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: "HELP" | "DISPUTE";
  status: string;
  category: string;
  priority: string;
  roleContext: string;
  subject: string;
  createdById: string;
  assignedToId: string | null;
};

type Message = {
  id: string;
  authorId: string;
  message: string;
  createdAt: string;
};

type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
};

type Dispute = {
  id: string;
  status: string;
  decision: string | null;
  decisionSummary: string | null;
  decisionAt: string | null;
  deadlineAt: string;
  disputeReason: string;
  againstRole: string;
  jobId: string;
};

function getTicketIdFromPath(): string {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export default function TicketDetailPage() {
  const ticketId = getTicketIdFromPath();
  const path = usePathname();
  const base = supportBase(path);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [dispute, setDispute] = React.useState<Dispute | null>(null);

  const [draft, setDraft] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/support/tickets/${ticketId}`, { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load ticket");
      setTicket(json.ticket ?? null);
      setMessages(Array.isArray(json.messages) ? json.messages : []);

      const [attResp, dispResp] = await Promise.all([
        fetch(`/api/app/support/tickets/${ticketId}/attachments`, { cache: "no-store" }),
        fetch(`/api/app/support/tickets/${ticketId}/dispute`, { cache: "no-store" })
      ]);
      const attJson = await attResp.json().catch(() => null);
      setAttachments(attResp.ok && Array.isArray(attJson?.attachments) ? attJson.attachments : []);

      const dispJson = await dispResp.json().catch(() => null);
      setDispute(dispResp.ok ? (dispJson?.dispute ?? null) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage() {
    setSending(true);
    setError("");
    try {
      const msg = draft.trim();
      if (!msg) throw new Error("Message is empty.");
      const resp = await fetch(`/api/app/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg })
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to send");
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function uploadEvidence(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", f);
        const resp = await fetch(`/api/app/support/tickets/${ticketId}/attachments`, { method: "POST", body: fd });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(json?.error ?? "Upload failed");
      }
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{ticket?.subject ?? "Ticket"}</h2>
          <div className="text-gray-600 mt-1 text-sm">
            {ticket?.type === "DISPUTE" ? "⚖️ Dispute" : "🆘 Help"} • Status: {ticket?.status ?? "—"} • Priority:{" "}
            {ticket?.priority ?? "—"}
          </div>
        </div>
        <Link href={`${base}/history`} className="text-8fold-green font-semibold">
          ← Back to history
        </Link>
      </div>

      {error ? <div className="text-red-600 font-semibold">{error}</div> : null}
      {loading ? <div className="text-gray-600">Loading…</div> : null}

      {ticket?.type === "DISPUTE" && dispute ? (
        <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
          <div className="font-bold text-gray-900">Dispute status: {dispute.status}</div>
          <div className="text-sm text-gray-600 mt-1">
            Reason: {dispute.disputeReason} • Against: {dispute.againstRole} • Deadline:{" "}
            {new Date(dispute.deadlineAt).toLocaleDateString()}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Copy: <span className="font-semibold">A decision will be reached within 15 business days.</span>
          </div>
          {dispute.decision ? (
            <div className="mt-3">
              <div className="font-bold text-gray-900">Decision: {dispute.decision}</div>
              {dispute.decisionSummary ? <div className="text-gray-700 mt-1">{dispute.decisionSummary}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border border-gray-200 rounded-2xl p-4">
        <div className="font-bold text-gray-900 mb-2">Conversation</div>
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="border border-gray-200 rounded-xl p-3">
              <div className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleString()}</div>
              <div className="text-gray-800 whitespace-pre-wrap mt-1">{m.message}</div>
            </div>
          ))}
          {messages.length === 0 ? <div className="text-gray-600">No messages yet.</div> : null}
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-gray-700">Add a message</div>
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[120px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a reply..."
            maxLength={5000}
          />
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button
              onClick={() => void sendMessage()}
              disabled={sending}
              className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send"}
            </button>
            <label className="text-sm text-gray-700 font-medium">
              Evidence (images, PDFs, docs)
              <input
                ref={fileRef}
                type="file"
                multiple
                className="block mt-1"
                accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => void uploadEvidence(e.target.files)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl p-4">
        <div className="font-bold text-gray-900 mb-2">Evidence</div>
        {attachments.length === 0 ? (
          <div className="text-gray-600 text-sm">No evidence uploaded yet.</div>
        ) : (
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {attachments.map((a) => (
              <li key={a.id}>
                <a className="text-8fold-green font-semibold" href={`/api/app/support/attachments/${a.id}`} target="_blank">
                  {a.originalName}
                </a>{" "}
                <span className="text-gray-600">({Math.round(a.sizeBytes / 1024)} KB)</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

