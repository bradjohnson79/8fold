"use client";

import { useEffect, useState } from "react";
import { diseFetch } from "@/lib/api";

type Directory = {
  id: string;
  name: string;
  homepageUrl: string | null;
  submissionUrl: string | null;
  contactEmail: string | null;
  region: string | null;
  country: string | null;
  category: string | null;
  scope: string;
  targetUrlOverride: string | null;
  free: boolean | null;
  requiresApproval: boolean | null;
  authorityScore: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
};

export default function DirectoriesPage() {
  const [dirs, setDirs] = useState<Directory[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [scope, setScope] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (country) params.set("country", country);
    if (scope) params.set("scope", scope);
    const q = params.toString() ? `?${params}` : "";
    diseFetch<{ data: Directory[] }>(`/api/dise/directories${q}`)
      .then((r) => {
        if (r.ok && r.data) {
          const arr = Array.isArray(r.data) ? r.data : (r.data as { data: Directory[] }).data;
          setDirs(arr ?? []);
        } else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [region, country, scope]);

  const updateStatus = async (id: string, status: string) => {
    const r = await diseFetch(`/api/dise/directories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (r.ok) load();
    else setErr(r.error ?? "Update failed");
  };

  const [discoverRegion, setDiscoverRegion] = useState("");
  const [discoverCountry, setDiscoverCountry] = useState("");
  const [discoverCategory, setDiscoverCategory] = useState("");
  const [discovering, setDiscovering] = useState(false);

  const runDiscovery = async () => {
    setDiscovering(true);
    setErr(null);
    const r = await diseFetch("/api/dise/discovery", {
      method: "POST",
      body: JSON.stringify({
        region: discoverRegion || undefined,
        country: discoverCountry || undefined,
        category: discoverCategory || undefined,
      }),
    });
    setDiscovering(false);
    if (r.ok) load();
    else setErr(r.error ?? "Discovery failed");
  };

  return (
    <div>
      <h1 style={{ marginBottom: "1rem" }}>Directories</h1>
      <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#1e293b", borderRadius: 8, maxWidth: 500 }}>
        <h3 style={{ marginBottom: "0.75rem" }}>Discover (GPT stub)</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input type="text" placeholder="Region" value={discoverRegion} onChange={(e) => setDiscoverRegion(e.target.value)} style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
          <input type="text" placeholder="Country" value={discoverCountry} onChange={(e) => setDiscoverCountry(e.target.value)} style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
          <input type="text" placeholder="Category (GENERAL|TRADE|STARTUP|LOCAL|TECH)" value={discoverCategory} onChange={(e) => setDiscoverCategory(e.target.value)} style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
          <button onClick={runDiscovery} disabled={discovering} style={{ padding: "0.5rem", background: "#3b82f6", border: "none", borderRadius: 6, cursor: discovering ? "not-allowed" : "pointer" }}>{discovering ? "Discovering…" : "Discover"}</button>
        </div>
      </div>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <span>
          <label style={{ marginRight: "0.5rem" }}>Region:</label>
          <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Vancouver" style={{ padding: "0.5rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
        </span>
        <span>
          <label style={{ marginRight: "0.5rem" }}>Country:</label>
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. CA" style={{ padding: "0.5rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
        </span>
        <span>
          <label style={{ marginRight: "0.5rem" }}>Scope:</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ padding: "0.5rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }}>
            <option value="">All</option>
            <option value="REGIONAL">Regional</option>
            <option value="NATIONAL">National</option>
          </select>
        </span>
      </div>
      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Name</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Region</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Country</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Scope</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Category</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Status</th>
              <th style={{ textAlign: "left", padding: "0.75rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(dirs ?? []).map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "0.75rem" }}>
                  <a href={d.homepageUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                    {d.name}
                  </a>
                </td>
                <td style={{ padding: "0.75rem" }}>{d.region ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{d.country ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{d.scope ?? "REGIONAL"}</td>
                <td style={{ padding: "0.75rem" }}>{d.category ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{d.status}</td>
                <td style={{ padding: "0.75rem" }}>
                  {d.status === "NEW" && (
                    <>
                      <button onClick={() => updateStatus(d.id, "APPROVED")} style={{ marginRight: "0.5rem", padding: "0.25rem 0.5rem", background: "#22c55e", border: "none", borderRadius: 4, cursor: "pointer" }}>Approve</button>
                      <button onClick={() => updateStatus(d.id, "REJECTED")} style={{ padding: "0.25rem 0.5rem", background: "#ef4444", border: "none", borderRadius: 4, cursor: "pointer" }}>Reject</button>
                    </>
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
