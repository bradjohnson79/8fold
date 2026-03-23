"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Message = {
  id: string;
  campaign_id: string | null;
  lead_id: string;
  subject: string;
  body: string;
  status: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  category: string | null;
  city: string | null;
};

const SIGNATURE = "\n\nBest,\nBrad Johnson\nChief Operating Officer\nhttps://8fold.app\ninfo@8fold.app";

export default function JobPosterReviewPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/lgs/outreach/job-posters/messages?status=draft");
      const json = await res.json().catch(() => ({})) as { ok?: boolean; data?: Message[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Failed to load messages");
        return;
      }
      setMessages(json.data ?? []);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(id: string) {
    const res = await fetch(`/api/lgs/outreach/job-posters/messages/${id}/approve`, { method: "POST" });
    const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Approve failed");
    else await load();
  }

  async function reject(id: string) {
    const res = await fetch(`/api/lgs/outreach/job-posters/messages/${id}/reject`, { method: "POST" });
    const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Reject failed");
    else await load();
  }

  function startEdit(message: Message) {
    setEditingId(message.id);
    setEditSubject(message.subject);
    setEditBody(message.body);
  }

  async function saveEdit() {
    if (!editingId) return;
    const res = await fetch(`/api/lgs/outreach/job-posters/messages/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: editSubject, body: editBody }),
    });
    const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!json.ok) {
      setError(json.error ?? "Save failed");
      return;
    }
    setEditingId(null);
    await load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Job Poster Review</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
            Draft messages must be reviewed before they can be auto-queued for the job-poster send worker.
          </p>
        </div>
        <Link href="/outreach/job-posters/queue" style={{ padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8 }}>
          Queue
        </Link>
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {messages.length === 0 && !error && <p style={{ color: "#94a3b8" }}>No job-poster drafts pending review.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {messages.map((message) => (
          <div key={message.id} style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem" }}>
            <div style={{ marginBottom: "0.5rem", color: "#f8fafc", fontWeight: 600 }}>
              {message.contact_name ?? message.company_name ?? "—"} · {message.category ?? "—"} · {message.city ?? "—"}
            </div>
            <div style={{ marginBottom: "0.75rem", color: "#94a3b8", fontSize: "0.85rem" }}>
              To: {message.email ?? "Missing email"}
            </div>

            {editingId === message.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#f8fafc", padding: "0.65rem 0.8rem" }}
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={7}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#f8fafc", padding: "0.75rem 0.8rem" }}
                />
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button onClick={saveEdit} style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 8 }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "0.5rem" }}><strong>Subject:</strong> {message.subject}</div>
                <div style={{ whiteSpace: "pre-wrap", color: "#e2e8f0" }}>{message.body}</div>
                <div style={{ marginTop: "0.75rem", padding: "0.85rem", background: "#0f172a", borderRadius: 8, whiteSpace: "pre-wrap", color: "#94a3b8" }}>
                  {message.body}{SIGNATURE}
                </div>
              </>
            )}

            {editingId !== message.id && (
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                <button onClick={() => approve(message.id)} style={{ padding: "0.5rem 1rem", background: "#22c55e", color: "#0f172a", borderRadius: 8 }}>
                  Approve
                </button>
                <button onClick={() => startEdit(message)} style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 8 }}>
                  Edit
                </button>
                <button onClick={() => reject(message.id)} style={{ padding: "0.5rem 1rem", background: "#ef4444", color: "#fff", borderRadius: 8 }}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
