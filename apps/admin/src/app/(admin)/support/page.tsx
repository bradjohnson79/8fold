"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Ticket = {
  id: string;
  status: string;
  priority: string;
  category: string;
  subject: string;
  roleContext: string;
  updatedAt: string;
};

export default function SupportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Ticket[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/support/tickets?take=200", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markInProgress(id: string) {
    await fetch(`/api/admin/v4/support/tickets/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Support</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Support tickets from Admin V4.{" "}
        <Link href="/support/job-requests" style={{ color: "rgba(125,211,252,0.95)", textDecoration: "none", fontWeight: 900 }}>
          Job Requests
        </Link>
      </p>

      {loading ? <div style={{ marginTop: 14 }}>Loading tickets...</div> : null}
      {error ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={retryButton}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? <div style={{ marginTop: 14 }}>No support tickets found.</div> : null}

      {!loading && !error && items.length > 0 ? (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Ticket", "Status", "Priority", "Category", "Role", "Updated", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td style={tdStyle}><Link href={`/support/${encodeURIComponent(t.id)}`} style={linkStyle}>{t.subject || t.id}</Link></td>
                  <td style={tdStyle}>{t.status}</td>
                  <td style={tdStyle}>{t.priority}</td>
                  <td style={tdStyle}>{t.category}</td>
                  <td style={tdStyle}>{t.roleContext}</td>
                  <td style={tdStyle}>{t.updatedAt ? t.updatedAt.slice(0, 19).replace("T", " ") : "-"}</td>
                  <td style={tdStyle}>
                    <button style={actionButton} onClick={() => void markInProgress(t.id)}>Mark In Progress</button>
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
};
const tdStyle: React.CSSProperties = {
  color: "rgba(226,232,240,0.9)",
  borderBottom: "1px solid rgba(148,163,184,0.1)",
  padding: "8px 10px",
  fontSize: 13,
};
const linkStyle: React.CSSProperties = { color: "rgba(125,211,252,0.95)", textDecoration: "none", fontWeight: 900 };
const retryButton: React.CSSProperties = { marginTop: 8, borderRadius: 10, padding: "8px 12px", cursor: "pointer" };
const actionButton: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(34,197,94,0.3)",
  background: "rgba(34,197,94,0.14)",
  color: "rgba(134,239,172,0.95)",
  padding: "6px 10px",
  fontWeight: 800,
  cursor: "pointer",
};
