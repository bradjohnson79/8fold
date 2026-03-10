"use client";

import { useCallback, useEffect, useState } from "react";

type PingResult = { engine: string; url: string; status: string; responseCode?: number; errorMessage?: string };
type LogEntry = { id: string; url: string; engine: string; status: string; responseCode?: number; triggeredBy?: string; createdAt: string };

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 16, padding: 20, background: "var(--card-bg)", marginBottom: 16 };
const input: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "10px 20px", borderRadius: 10, border: "none", background: "rgba(34,197,94,0.16)", color: "rgba(34,197,94,1)", fontWeight: 900, cursor: "pointer", fontSize: 14 };
const statusColor = (s: string) => s === "success" ? "rgba(134,239,172,0.95)" : "rgba(254,202,202,0.95)";

export default function IndexingPage() {
  const [url, setUrl] = useState("");
  const [pinging, setPinging] = useState(false);
  const [pingResults, setPingResults] = useState<PingResult[] | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const resp = await fetch("/api/admin/v4/seo/indexing/logs?limit=50", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (json?.ok) setLogs(json.data?.logs ?? []);
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  }, []);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const ping = async () => {
    if (!url.trim()) return;
    setPinging(true);
    setPingResults(null);
    setPingError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/indexing/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setPingError(json?.error?.message ?? "Ping failed");
      } else {
        setPingResults(json.data?.results ?? []);
        await loadLogs();
      }
    } catch { setPingError("Request failed"); }
    finally { setPinging(false); }
  };

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Indexing / Ping Engine</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Notify search engines immediately when new pages are created. Supports Google Indexing API and IndexNow.
      </p>

      <div style={card}>
        <div style={{ fontWeight: 900, marginBottom: 14 }}>Manual Ping</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>URL to Index</div>
            <input style={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://8fold.app/jobs/abc123" />
          </div>
          <button style={btn} onClick={() => void ping()} disabled={pinging || !url.trim()}>
            {pinging ? "Pinging…" : "Ping Engines"}
          </button>
        </div>

        {pingError && <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>{pingError}</div>}
        {pingResults && (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {pingResults.map((r) => (
              <div key={r.engine} style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "rgba(2,6,23,0.3)" }}>
                <div style={{ fontWeight: 900, textTransform: "capitalize" }}>{r.engine}</div>
                <div style={{ color: statusColor(r.status), fontWeight: 700, fontSize: 13, marginTop: 4 }}>{r.status.toUpperCase()}</div>
                {r.responseCode && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>HTTP {r.responseCode}</div>}
                {r.errorMessage && <div style={{ color: "rgba(254,202,202,0.8)", fontSize: 12, marginTop: 4 }}>{r.errorMessage}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 900 }}>Indexing Log</div>
          <button style={{ ...btn, padding: "6px 14px", fontSize: 12 }} onClick={() => void loadLogs()}>Refresh</button>
        </div>

        {logsLoading && <div style={{ color: "var(--muted)" }}>Loading logs…</div>}
        {!logsLoading && logs.length === 0 && <div style={{ color: "var(--muted)" }}>No indexing logs yet.</div>}
        {!logsLoading && logs.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Engine", "Status", "URL", "HTTP", "Triggered By", "Time"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--muted)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                    <td style={{ padding: "8px 10px", textTransform: "capitalize", fontWeight: 700 }}>{log.engine}</td>
                    <td style={{ padding: "8px 10px", color: statusColor(log.status), fontWeight: 700 }}>{log.status}</td>
                    <td style={{ padding: "8px 10px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.url}</td>
                    <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{log.responseCode ?? "—"}</td>
                    <td style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12 }}>{log.triggeredBy ?? "—"}</td>
                    <td style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12 }}>{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
