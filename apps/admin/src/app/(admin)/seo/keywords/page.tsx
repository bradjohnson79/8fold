"use client";

import { useState } from "react";

type KeywordResult = {
  keyword: string;
  cityVariants: string[];
  serviceVariants: string[];
  estimatedPopularity: number;
};

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 16, padding: 20, background: "var(--card-bg)", marginBottom: 16 };
const input: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 14, flex: 1 };
const btn: React.CSSProperties = { padding: "10px 20px", borderRadius: 10, border: "none", background: "rgba(34,197,94,0.16)", color: "rgba(34,197,94,1)", fontWeight: 900, cursor: "pointer", fontSize: 14 };
const tag: React.CSSProperties = { display: "inline-block", padding: "3px 10px", borderRadius: 20, background: "rgba(148,163,184,0.12)", fontSize: 12, color: "var(--muted)", margin: "2px" };

function PopularityBar({ score }: { score: number }) {
  const color = score >= 70 ? "rgba(34,197,94,0.7)" : score >= 40 ? "rgba(251,191,36,0.7)" : "rgba(148,163,184,0.4)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(148,163,184,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28 }}>{score}</div>
    </div>
  );
}

export default function KeywordsPage() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [searched, setSearched] = useState(false);

  const discover = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const resp = await fetch("/api/admin/v4/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) { setError(json?.error?.message ?? "Discovery failed"); }
      else { setResults(json.data?.keywords ?? []); setSearched(true); }
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") void discover(); };

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Keyword Discovery</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Discover SEO opportunities. Enter a base keyword to generate city variants, service variants, and long-tail suggestions.
      </p>

      <div style={card}>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={input} value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={handleKey} placeholder="e.g. handyman, plumbing, furniture assembly" />
          <button style={btn} onClick={() => void discover()} disabled={loading || !keyword.trim()}>
            {loading ? "Discovering…" : "Discover Keywords"}
          </button>
        </div>
      </div>

      {error && <div style={{ color: "rgba(254,202,202,0.95)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

      {searched && results.length === 0 && !loading && (
        <div style={{ color: "var(--muted)" }}>No keyword suggestions found.</div>
      )}

      {results.map((r, i) => (
        <div key={i} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{r.keyword}</div>
            <div style={{ width: 160 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Popularity</div>
              <PopularityBar score={r.estimatedPopularity} />
            </div>
          </div>

          {r.cityVariants.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>City Variants</div>
              <div>{r.cityVariants.map((v) => <span key={v} style={tag}>{v}</span>)}</div>
            </div>
          )}

          {r.serviceVariants.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Service Variants</div>
              <div>{r.serviceVariants.map((v) => <span key={v} style={tag}>{v}</span>)}</div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <a href={`/seo/local-seo?keyword=${encodeURIComponent(r.keyword)}`} style={{ fontSize: 12, color: "rgba(34,197,94,0.8)", textDecoration: "none", fontWeight: 700 }}>
              → Generate Local SEO Pages
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
