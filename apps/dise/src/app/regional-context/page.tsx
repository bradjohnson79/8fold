"use client";

import { useEffect, useState } from "react";
import { diseFetch } from "@/lib/api";

type RegionalContext = {
  id: string;
  region: string;
  country: string | null;
  keyIndustries: unknown;
  topTrades: unknown;
  serviceDemand: unknown;
  populationTraits: unknown;
  updatedAt: string;
};

export default function RegionalContextPage() {
  const [contexts, setContexts] = useState<RegionalContext[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    diseFetch<{ data: RegionalContext[] }>("/api/dise/regional-context")
      .then((r) => {
        if (r.ok && r.data) setContexts((r.data as { data: RegionalContext[] }).data);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    if (!region) {
      setErr("Region required");
      return;
    }
    setGenerating(true);
    setErr(null);
    const r = await diseFetch("/api/dise/regional-context/generate", {
      method: "POST",
      body: JSON.stringify({ region, country: country || undefined, overwrite }),
    });
    setGenerating(false);
    if (r.ok) load();
    else setErr(r.error ?? "Generate failed");
  };

  return (
    <div>
      <h1 style={{ marginBottom: "1rem" }}>Regional Context</h1>
      <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#1e293b", borderRadius: 8, maxWidth: 400 }}>
        <h3 style={{ marginBottom: "0.75rem" }}>Generate</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }}
          />
          <input
            type="text"
            placeholder="Country (optional)"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            style={{ padding: "0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Overwrite if exists
          </label>
          <button onClick={generate} disabled={generating} style={{ padding: "0.5rem", background: "#3b82f6", border: "none", borderRadius: 6, cursor: generating ? "not-allowed" : "pointer" }}>
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}
      <div>
        {contexts.map((c) => (
          <div key={c.id} style={{ marginBottom: "1rem", padding: "1rem", background: "#1e293b", borderRadius: 8 }}>
            <h3>{c.region}</h3>
            <pre style={{ fontSize: "0.8rem", overflow: "auto", marginTop: "0.5rem" }}>
              {JSON.stringify({ keyIndustries: c.keyIndustries, topTrades: c.topTrades, serviceDemand: c.serviceDemand, populationTraits: c.populationTraits }, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
