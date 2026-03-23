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
  lead_id: string;
  subject: string;
  body: string;
  status: string;
  generated_by: string | null;
  created_at: string | null;
  lead_name: string | null;
  business_name: string | null;
  email: string;
  trade: string | null;
  city: string | null;
};

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    lgsFetch<{ data: Message[] }>("/api/lgs/messages?status=pending_review")
      .then((r) => {
        if (r.ok && r.data) setMessages((r.data as { data: Message[] }).data ?? []);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => load(), []);

  async function approve(id: string) {
    const r = await lgsFetch<{ ok: boolean }>(`/api/lgs/messages/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (r.ok) load();
    else setErr(r.error ?? "Approve failed");
    if (r.ok) load();
    else setErr(r.error ?? "Approve failed");
  }

  async function reject(id: string) {
    const r = await lgsFetch(`/api/lgs/messages/${id}/reject`, { method: "POST" });
    if (r.ok) load();
    else setErr(r.error ?? "Reject failed");
  }

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        Messages (AI Generated) <HelpTooltip text={helpText.messages} />
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        GPT-generated outreach emails awaiting human review. Approve to mark them ready for automatic queueing.
      </p>
      <p style={{ marginBottom: "1.5rem" }}>
        <Link href="/leads" style={{ padding: "0.5rem 1rem", background: "#1e293b", borderRadius: 8 }}>
          Generate from Leads
        </Link>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {messages.length === 0 && (
          <p style={{ color: "#94a3b8" }}>
            No messages pending review.{" "}
            <Link href="/leads" style={{ color: "#38bdf8" }}>
              Generate from Leads
            </Link>
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ padding: "1.25rem", background: "#1e293b", borderRadius: 8 }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>{m.lead_name ?? "—"}</strong> · {m.business_name ?? "—"} · {m.trade ?? "—"} · {m.city ?? "—"}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "0.5rem" }}>To: {m.email}</div>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Subject:</strong> {m.subject}
            </div>
            <div style={{ marginBottom: "0.5rem", whiteSpace: "pre-wrap" }}>{m.body}</div>
            <button
              onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
              style={{
                padding: "0.25rem 0.5rem",
                marginBottom: "0.5rem",
                background: "#334155",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {expandedId === m.id ? "Hide" : "Preview"} Final Email
            </button>
            {expandedId === m.id && (
              <div
                style={{
                  padding: "1rem",
                  background: "#0f172a",
                  borderRadius: 4,
                  whiteSpace: "pre-wrap",
                  fontSize: "0.875rem",
                }}
              >
                {previewBody(m.body)}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                onClick={() => approve(m.id)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#22c55e",
                  color: "#0f172a",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Approve
              </button>
              <button
                onClick={() => reject(m.id)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: "2rem" }}>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>
          ← Back to Outreach
        </Link>
      </p>
    </div>
  );
}
