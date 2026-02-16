"use client";

import { useEffect, useState } from "react";
import { diseFetch } from "@/lib/api";

type Backlink = {
  id: string;
  directoryId: string;
  listingUrl: string | null;
  verified: boolean;
  lastChecked: string | null;
  createdAt: string;
  directory?: { name: string };
};

export default function BacklinksPage() {
  const [links, setLinks] = useState<Backlink[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [verified, setVerified] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const q = verified ? `?verified=${verified}` : "";
    diseFetch<{ data: Backlink[] }>(`/api/dise/backlinks${q}`)
      .then((r) => {
        if (r.ok && r.data) setLinks((r.data as { data: Backlink[] }).data);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [verified]);

  const patch = async (id: string, body: object) => {
    const r = await diseFetch(`/api/dise/backlinks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (r.ok) load();
    else setErr(r.error ?? "Update failed");
  };

  return (
    <div>
      <h1 style={{ marginBottom: "1rem" }}>Backlinks</h1>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label>Filter:</label>
        <select
          value={verified}
          onChange={(e) => setVerified(e.target.value)}
          style={{ padding: "0.5rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }}
        >
          <option value="">All</option>
          <option value="true">Verified</option>
          <option value="false">Not verified</option>
        </select>
      </div>
      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Directory</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Listing URL</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Verified</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Last checked</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {links.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "0.75rem" }}>{b.directory?.name ?? b.directoryId}</td>
                <td style={{ padding: "0.75rem" }}>
                  {b.listingUrl ? (
                    <a href={b.listingUrl} target="_blank" rel="noopener noreferrer">
                      {b.listingUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ padding: "0.75rem" }}>{b.verified ? "Yes" : "No"}</td>
                <td style={{ padding: "0.75rem" }}>{b.lastChecked ? new Date(b.lastChecked).toLocaleDateString() : "—"}</td>
                <td style={{ padding: "0.75rem" }}>
                  {!b.verified && (
                    <button
                      onClick={() => patch(b.id, { verified: true })}
                      style={{ padding: "0.25rem 0.5rem", background: "#22c55e", border: "none", borderRadius: 4, cursor: "pointer" }}
                    >
                      Mark verified
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
