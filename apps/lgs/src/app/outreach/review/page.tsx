"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

const SIGNATURE = `
Brad Johnson
Chief Operating Officer
https://8fold.app
info@8fold.app`;

function previewBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed.endsWith("Best,")) {
    return `${trimmed}\n\nBest,${SIGNATURE}`;
  }
  return `${trimmed}${SIGNATURE}`;
}

type Message = {
  id: string;
  contactId: string;
  subject: string;
  body: string;
  approved: boolean;
  createdAt: string;
  contactName: string | null;
  contactEmail: string;
  contactTrade: string | null;
  contactLocation: string | null;
};

export default function ReviewPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  function load() {
    lgsFetch<{ data: Message[] }>("/api/lgs/outreach/messages?approved=false")
      .then((r) => {
        if (r.ok && r.data) setMessages((r.data as { data: Message[] }).data ?? []);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => load(), []);

  async function approve(id: string) {
    const r = await lgsFetch(`/api/lgs/outreach/messages/${id}/approve`, { method: "POST" });
    if (r.ok) load();
    else setErr(r.error ?? "Approve failed");
  }

  async function reject(id: string) {
    const r = await lgsFetch(`/api/lgs/outreach/messages/${id}/reject`, { method: "POST" });
    if (r.ok) load();
    else setErr(r.error ?? "Reject failed");
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditSubject(m.subject);
    setEditBody(m.body);
  }

  async function saveEdit() {
    if (!editingId) return;
    const r = await fetch(`/api/lgs/outreach/messages/${editingId}/edit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: editSubject, body: editBody }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(json.error ?? "Edit failed");
      return;
    }
    setEditingId(null);
    load();
  }

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        Email Review <HelpTooltip text={helpText.messages} />
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        Approve messages to queue for sending. Preview shows exactly what will be sent.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {messages.length === 0 && <p style={{ color: "#94a3b8" }}>No messages pending review.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ padding: "1.25rem", background: "#1e293b", borderRadius: 8 }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>{m.contactName ?? "—"}</strong> · {m.contactTrade ?? "—"} · {m.contactLocation ?? "—"}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "0.5rem" }}>To: {m.contactEmail}</div>
            {editingId === m.id ? (
              <div style={{ marginBottom: "1rem" }}>
                <input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Subject"
                  style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 4 }}
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Body"
                  rows={6}
                  style={{ width: "100%", padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 4 }}
                />
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button onClick={saveEdit} style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 4, cursor: "pointer" }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "0.5rem" }}><strong>Subject:</strong> {m.subject}</div>
                <div style={{ marginBottom: "0.5rem", whiteSpace: "pre-wrap" }}>{m.body}</div>
                <button
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  style={{ padding: "0.25rem 0.5rem", marginBottom: "0.5rem", background: "#334155", borderRadius: 4, cursor: "pointer", fontSize: "0.875rem" }}
                >
                  {expandedId === m.id ? "Hide" : "Preview"} Final Email
                </button>
                {expandedId === m.id && (
                  <div style={{ padding: "1rem", background: "#0f172a", borderRadius: 4, whiteSpace: "pre-wrap", fontSize: "0.875rem" }}>
                    {previewBody(m.body)}
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              {editingId !== m.id && (
                <>
                  <button onClick={() => approve(m.id)} style={{ padding: "0.5rem 1rem", background: "#22c55e", color: "#0f172a", borderRadius: 4, cursor: "pointer" }}>Approve</button>
                  <button onClick={() => startEdit(m)} style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 4, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => reject(m.id)} style={{ padding: "0.5rem 1rem", background: "#ef4444", color: "#fff", borderRadius: 4, cursor: "pointer" }}>Reject</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: "2rem" }}>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>← Back to Outreach</Link>
      </p>
    </div>
  );
}
