"use client";

import { useEffect, useState } from "react";
import { diseFetch } from "@/lib/api";

type Submission = {
  id: string;
  directoryId: string;
  region: string | null;
  generatedVariants: string[] | null;
  selectedVariant: string | null;
  status: string;
  listingUrl: string | null;
  targetUrlOverride: string | null;
  submittedAt: string | null;
  notes: string | null;
  createdAt: string;
  directory?: { name: string; scope?: string };
};

export default function SubmissionsPage() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [dirs, setDirs] = useState<{ id: string; name: string; scope?: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [genDirId, setGenDirId] = useState("");
  const [genRegion, setGenRegion] = useState("");
  const [genCountry, setGenCountry] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = () => {
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    diseFetch<{ data: Submission[] }>(`/api/dise/submissions${q}`)
      .then((r) => {
        if (r.ok && r.data) setSubs((r.data as { data: Submission[] }).data);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status]);

  useEffect(() => {
    diseFetch<{ data: { id: string; name: string; scope?: string }[] }>("/api/dise/directories").then((r) => {
      if (r.ok && r.data) setDirs((r.data as { data: { id: string; name: string; scope?: string }[] }).data);
    });
  }, []);

  const selectedDir = dirs.find((d) => d.id === genDirId);
  const isNational = selectedDir?.scope === "NATIONAL";

  const runGenerate = async () => {
    if (!genDirId) {
      setErr("Directory required");
      return;
    }
    if (!isNational && !genRegion) {
      setErr("Region required for regional directories");
      return;
    }
    setGenerating(true);
    setErr(null);
    const r = await diseFetch("/api/dise/submissions/generate", {
      method: "POST",
      body: JSON.stringify({
        directoryId: genDirId,
        region: isNational ? undefined : genRegion,
        country: isNational ? genCountry || undefined : undefined,
      }),
    });
    setGenerating(false);
    if (r.ok) load();
    else setErr(r.error ?? "Generate failed");
  };

  const patch = async (id: string, body: object) => {
    const r = await diseFetch(`/api/dise/submissions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (r.ok) load();
    else setErr(r.error ?? "Update failed");
  };

  return (
    <div>
      <h1 style={{ marginBottom: "1rem" }}>Submissions</h1>
      <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#1e293b", borderRadius: 8, maxWidth: 500 }}>
        <h3 style={{ marginBottom: "0.75rem" }}>Generate variants (GPT stub)</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <select value={genDirId} onChange={(e) => setGenDirId(e.target.value)} style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }}>
            <option value="">Select directory</option>
            {dirs.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.scope ?? "REGIONAL"})</option>
            ))}
          </select>
          {isNational ? (
            <input type="text" placeholder="Country (optional)" value={genCountry} onChange={(e) => setGenCountry(e.target.value)} style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
          ) : (
            <input type="text" placeholder="Region (required)" value={genRegion} onChange={(e) => setGenRegion(e.target.value)} style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }} />
          )}
          <button onClick={runGenerate} disabled={generating} style={{ padding: "0.5rem", background: "#3b82f6", border: "none", borderRadius: 6, cursor: generating ? "not-allowed" : "pointer" }}>{generating ? "Generating…" : "Generate"}</button>
        </div>
      </div>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label>Filter by status:</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "0.5rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }}
        >
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="READY">Ready</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>
      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {subs.map((s) => (
            <div key={s.id} style={{ padding: "1rem", background: "#1e293b", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>{s.directory?.name ?? s.directoryId}</strong>
                <span>{s.status}</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
                Scope: {s.directory?.scope ?? "REGIONAL"}
                {s.targetUrlOverride ? ` · Target URL: ${s.targetUrlOverride}` : " · Target URL: (default)"}
              </div>
              {s.generatedVariants && s.generatedVariants.length > 0 && (
                <div style={{ marginBottom: "0.5rem" }}>
                  {s.generatedVariants.map((v, i) => (
                    <div key={i} style={{ marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                        <input
                          type="radio"
                          name={s.id}
                          checked={s.selectedVariant === v}
                          onChange={() => patch(s.id, { selectedVariant: v, status: "READY" })}
                        />
                        <span>{v}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              {(s.status === "DRAFT" || s.status === "READY") && (
                <TargetUrlOverride submission={s} onSave={(v) => patch(s.id, { targetUrlOverride: v || null })} />
              )}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {s.status === "READY" && (
                  <button onClick={() => patch(s.id, { status: "SUBMITTED" })} style={{ padding: "0.25rem 0.5rem", background: "#3b82f6", border: "none", borderRadius: 4, cursor: "pointer" }}>
                    Mark Submitted
                  </button>
                )}
                {s.status === "SUBMITTED" && (
                  <ApproveForm submissionId={s.id} onApprove={(listingUrl) => patch(s.id, { status: "APPROVED", listingUrl: listingUrl || undefined })} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetUrlOverride({ submission, onSave }: { submission: Submission; onSave: (v: string | null) => void }) {
  const [val, setVal] = useState(submission.targetUrlOverride ?? "");
  useEffect(() => {
    setVal(submission.targetUrlOverride ?? "");
  }, [submission.targetUrlOverride]);
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <label style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.25rem" }}>Target URL override (optional):</label>
      <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="text"
          placeholder="e.g. https://8fold.app/custom"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 4, color: "#e2e8f0", flex: 1, maxWidth: 400 }}
        />
        <button onClick={() => onSave(val.trim() || null)} style={{ padding: "0.25rem 0.5rem", background: "#64748b", border: "none", borderRadius: 4, cursor: "pointer" }}>Save</button>
      </span>
    </div>
  );
}

function ApproveForm({ onApprove }: { submissionId: string; onApprove: (listingUrl: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <input
        type="text"
        placeholder="Listing URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ padding: "0.25rem 0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 4, color: "#e2e8f0", minWidth: 200 }}
      />
      <button onClick={() => onApprove(url)} style={{ padding: "0.25rem 0.5rem", background: "#22c55e", border: "none", borderRadius: 4, cursor: "pointer" }}>
        Mark Approved
      </button>
    </span>
  );
}
