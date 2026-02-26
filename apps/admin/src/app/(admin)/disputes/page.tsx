"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Dispute = {
  id: string;
  status: string;
  disputeReason: string;
  againstRole: string;
  jobId: string;
  ticketSubject: string | null;
  deadlineAt: string;
  createdAt: string;
};

export default function DisputesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Dispute[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/disputes?take=200", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        const msg = String(json?.error?.message ?? json?.error ?? "Failed to load disputes");
        setError(msg);
        return;
      }
      setItems(Array.isArray(json.data?.disputes) ? (json.data.disputes as Dispute[]) : []);
    } catch {
      setError("Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Disputes</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>Active and historical disputes from Admin V4.</p>

      {loading ? <div style={{ marginTop: 14, color: "rgba(226,232,240,0.72)" }}>Loading disputes...</div> : null}

      {error ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={retryButton}>Retry</button>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div style={{ marginTop: 14, color: "rgba(226,232,240,0.72)" }}>No disputes found.</div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Dispute",
                  "Status",
                  "Reason",
                  "Against",
                  "Job",
                  "Ticket",
                  "Deadline",
                ].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}><Link href={`/disputes/${encodeURIComponent(d.id)}`} style={linkStyle}>{d.id}</Link></td>
                  <td style={tdStyle}>{d.status}</td>
                  <td style={tdStyle}>{d.disputeReason}</td>
                  <td style={tdStyle}>{d.againstRole}</td>
                  <td style={tdStyle}>{d.jobId}</td>
                  <td style={tdStyle}>{d.ticketSubject || "-"}</td>
                  <td style={tdStyle}>{d.deadlineAt ? d.deadlineAt.slice(0, 19).replace("T", " ") : "-"}</td>
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

const linkStyle: React.CSSProperties = {
  color: "rgba(125,211,252,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};

const retryButton: React.CSSProperties = {
  marginTop: 8,
  borderRadius: 10,
  border: "1px solid rgba(125,211,252,0.4)",
  padding: "8px 12px",
  background: "rgba(56,189,248,0.12)",
  color: "rgba(125,211,252,0.95)",
  fontWeight: 900,
  cursor: "pointer",
};
