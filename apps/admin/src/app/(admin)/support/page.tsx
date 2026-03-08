"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Ticket = {
  id: string;
  status: string;
  priority: string;
  category: string;
  ticketType?: string | null;
  subject: string;
  role: string;
  userId: string;
  jobId?: string | null;
  updatedAt: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "rgba(96,165,250,0.9)",
  ADMIN_REPLY: "rgba(52,211,153,0.9)",
  USER_REPLY: "rgba(251,191,36,0.9)",
  RESOLVED: "rgba(148,163,184,0.7)",
  CLOSED: "rgba(100,116,139,0.6)",
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "rgba(248,113,113,0.9)",
  NORMAL: "rgba(148,163,184,0.8)",
  LOW: "rgba(100,116,139,0.7)",
};

export default function AdminSupportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}&take=200` : "?take=200";
      const resp = await fetch(`/api/admin/v4/support/tickets${qs}`, { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load support tickets"));
        return;
      }
      setItems(Array.isArray(json.data?.tickets) ? (json.data.tickets as Ticket[]) : []);
    } catch {
      setError("Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Support</h1>
          <p style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", maxWidth: 680, fontSize: 13 }}>
            Internal helpdesk — all user support tickets.{" "}
            <Link href="/support/job-requests" style={{ color: "rgba(125,211,252,0.95)", textDecoration: "none", fontWeight: 900 }}>
              Job Requests
            </Link>
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: "rgba(15,23,42,0.7)",
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 8,
            color: "rgba(226,232,240,0.9)",
            padding: "7px 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="ADMIN_REPLY">Admin Reply</option>
          <option value="USER_REPLY">User Reply</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {loading ? <div style={{ marginTop: 20 }}>Loading tickets...</div> : null}
      {error ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={retryButton}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <div style={{ marginTop: 20, color: "rgba(226,232,240,0.6)" }}>No support tickets found.</div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div style={{ marginTop: 20, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Ticket", "Type", "Role", "Priority", "Status", "Job", "Updated", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                  <td style={tdStyle}>
                    <Link href={`/support/v4/${encodeURIComponent(t.id)}`} style={linkStyle}>
                      {t.subject || t.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td style={tdStyle}>{t.ticketType ?? t.category}</td>
                  <td style={tdStyle}>{t.role}</td>
                  <td style={tdStyle}>
                    <span style={{ color: PRIORITY_COLORS[t.priority] ?? "inherit", fontWeight: 700 }}>
                      {t.priority}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: STATUS_COLORS[t.status] ?? "inherit", fontWeight: 700 }}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={tdStyle}>{t.jobId ? t.jobId.slice(0, 8) + "…" : "—"}</td>
                  <td style={tdStyle}>{t.updatedAt ? t.updatedAt.slice(0, 19).replace("T", " ") : "-"}</td>
                  <td style={tdStyle}>
                    <Link href={`/support/v4/${encodeURIComponent(t.id)}`} style={actionButton}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  color: "rgba(226,232,240,0.72)",
  fontSize: 12,
  fontWeight: 900,
  borderBottom: "1px solid rgba(148,163,184,0.2)",
  padding: "8px 10px",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  color: "rgba(226,232,240,0.9)",
  padding: "10px 10px",
  fontSize: 13,
  verticalAlign: "middle",
};
const linkStyle: React.CSSProperties = {
  color: "rgba(125,211,252,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};
const retryButton: React.CSSProperties = { marginTop: 8, borderRadius: 10, padding: "8px 12px", cursor: "pointer" };
const actionButton: React.CSSProperties = {
  display: "inline-block",
  borderRadius: 8,
  border: "1px solid rgba(125,211,252,0.3)",
  background: "rgba(125,211,252,0.1)",
  color: "rgba(125,211,252,0.95)",
  padding: "5px 10px",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "none",
};
