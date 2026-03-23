"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type QueueItem = {
  id: string;
  campaign_id: string | null;
  sender_email: string;
  sent_at: string | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string | null;
  subject: string | null;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  category: string | null;
  city: string | null;
};

type QueueSummary = {
  pending: number;
  sent: number;
  failed: number;
};

export default function JobPosterQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/lgs/outreach/job-posters/queue${qs}`);
      const json = await res.json().catch(() => ({})) as {
        ok?: boolean;
        summary?: QueueSummary;
        data?: QueueItem[];
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "Failed to load queue");
        return;
      }
      setSummary(json.summary ?? null);
      setItems(json.data ?? []);
    } catch (err) {
      setError(String(err));
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 20000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Job Poster Queue</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
            Isolated outbound queue for the jobs pipeline using the shared sender pool.
          </p>
        </div>
        <Link href="/outreach/job-posters/review" style={{ padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8 }}>
          Review
        </Link>
      </div>

      {summary && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8 }}>Pending: {summary.pending}</div>
          <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8 }}>Sent: {summary.sent}</div>
          <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8 }}>Failed: {summary.failed}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        {["", "pending", "sent", "failed"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
              padding: "0.45rem 0.85rem",
              background: statusFilter === status ? "#334155" : "#1e293b",
              borderRadius: 8,
              color: statusFilter === status ? "#f8fafc" : "#94a3b8",
            }}
          >
            {status === "" ? "All" : status}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <div style={{ background: "#1e293b", borderRadius: 10, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
              {["Lead", "Subject", "Status", "Sender", "Retries", "Queued", "Sent/Error"].map((label) => (
                <th key={label} style={{ padding: "0.65rem 0.75rem", textAlign: "left" }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "0.65rem 0.75rem" }}>
                  <div style={{ color: "#f8fafc" }}>{item.contact_name ?? item.company_name ?? "—"}</div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem" }}>{item.email ?? "—"} · {item.category ?? "—"} · {item.city ?? "—"}</div>
                </td>
                <td style={{ padding: "0.65rem 0.75rem", color: "#cbd5e1" }}>{item.subject ?? "—"}</td>
                <td style={{ padding: "0.65rem 0.75rem" }}>{item.status}</td>
                <td style={{ padding: "0.65rem 0.75rem", fontFamily: "monospace", fontSize: "0.78rem" }}>{item.sender_email}</td>
                <td style={{ padding: "0.65rem 0.75rem" }}>{item.retry_count}</td>
                <td style={{ padding: "0.65rem 0.75rem", color: "#94a3b8" }}>
                  {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "0.65rem 0.75rem", color: item.error_message ? "#f87171" : "#94a3b8" }}>
                  {item.sent_at ? new Date(item.sent_at).toLocaleString() : item.error_message ?? "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "1rem", color: "#94a3b8" }}>
                  No queue items for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
