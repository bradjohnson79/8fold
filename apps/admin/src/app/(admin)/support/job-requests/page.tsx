"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type EditRequest = {
  id: string;
  type: "edit";
  jobId: string;
  jobPosterId: string;
  originalTitle: string;
  originalDescription: string;
  requestedTitle: string;
  requestedDescription: string;
  status: string;
  createdAt: string;
};

type CancelRequest = {
  id: string;
  type: "cancel";
  jobId: string;
  jobPosterId: string;
  reason: string;
  status: string;
  createdAt: string;
};

type Resp = {
  editRequests: EditRequest[];
  cancelRequests: CancelRequest[];
};

export default function JobRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/job-requests", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load job requests"));
        return;
      }
      const d = json.data ?? {};
      setData({
        editRequests: Array.isArray(d.editRequests) ? d.editRequests : [],
        cancelRequests: Array.isArray(d.cancelRequests) ? d.cancelRequests : [],
      });
    } catch {
      setError("Failed to load job requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approveEdit(id: string) {
    try {
      const resp = await fetch(`/api/admin/v4/job-requests/edit/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        alert(j?.error?.message ?? "Failed to approve");
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to approve");
    }
  }

  async function rejectEdit(id: string) {
    try {
      const resp = await fetch(`/api/admin/v4/job-requests/edit/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        alert(j?.error?.message ?? "Failed to reject");
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reject");
    }
  }

  async function approveCancel(id: string) {
    try {
      const resp = await fetch(`/api/admin/v4/job-requests/cancel/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        alert(j?.error?.message ?? "Failed to approve");
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to approve");
    }
  }

  async function rejectCancel(id: string) {
    try {
      const resp = await fetch(`/api/admin/v4/job-requests/cancel/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        alert(j?.error?.message ?? "Failed to reject");
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reject");
    }
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
  const btnStyle: React.CSSProperties = {
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    marginRight: 6,
  };
  const approveBtn: React.CSSProperties = { ...btnStyle, background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", color: "rgba(134,239,172,0.95)" };
  const rejectBtn: React.CSSProperties = { ...btnStyle, background: "rgba(248,113,113,0.2)", border: "1px solid rgba(248,113,113,0.4)", color: "rgba(254,202,202,0.95)" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Job Requests</h1>
          <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
            Edit and cancel requests from Job Posters. Approve or reject each request.
          </p>
        </div>
        <Link href="/support" style={linkStyle}>
          ← Support
        </Link>
      </div>

      {loading ? <div style={{ marginTop: 14 }}>Loading...</div> : null}
      {error ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={{ marginTop: 8, borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && data && (
        <>
          <div style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Edit Requests</h2>
            {data.editRequests.length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.72)" }}>No pending edit requests.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Job</th>
                      <th style={thStyle}>Poster</th>
                      <th style={thStyle}>OLD → NEW</th>
                      <th style={thStyle}>Created</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.editRequests.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>
                          <Link href={`/jobs/${encodeURIComponent(r.jobId)}`} style={linkStyle}>
                            {r.jobId.slice(0, 8)}…
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/users/${encodeURIComponent(r.jobPosterId)}`} style={linkStyle}>
                            {r.jobPosterId.slice(0, 8)}…
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontSize: 12 }}>
                            <div><strong>Title:</strong> {r.originalTitle} → {r.requestedTitle}</div>
                            <div style={{ marginTop: 4, whiteSpace: "pre-wrap", maxWidth: 400 }}><strong>Desc:</strong> {r.originalDescription.slice(0, 80)}… → {r.requestedDescription.slice(0, 80)}…</div>
                          </div>
                        </td>
                        <td style={tdStyle}>{r.createdAt ? r.createdAt.slice(0, 19).replace("T", " ") : "-"}</td>
                        <td style={tdStyle}>
                          <button style={approveBtn} onClick={() => void approveEdit(r.id)}>Approve</button>
                          <button style={rejectBtn} onClick={() => void rejectEdit(r.id)}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Cancel Requests</h2>
            {data.cancelRequests.length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.72)" }}>No pending cancel requests.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Job</th>
                      <th style={thStyle}>Poster</th>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Created</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cancelRequests.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>
                          <Link href={`/jobs/${encodeURIComponent(r.jobId)}`} style={linkStyle}>
                            {r.jobId.slice(0, 8)}…
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/users/${encodeURIComponent(r.jobPosterId)}`} style={linkStyle}>
                            {r.jobPosterId.slice(0, 8)}…
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ whiteSpace: "pre-wrap", maxWidth: 300, display: "inline-block" }}>{r.reason}</span>
                        </td>
                        <td style={tdStyle}>{r.createdAt ? r.createdAt.slice(0, 19).replace("T", " ") : "-"}</td>
                        <td style={tdStyle}>
                          <button style={approveBtn} onClick={() => void approveCancel(r.id)}>Approve</button>
                          <button style={rejectBtn} onClick={() => void rejectCancel(r.id)}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
