"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

const CSV_TEMPLATE = `website,company,address,city,state,country,first_name,last_name,title,email,trade
proper-handyman.com,Proper Handyman,123 Market St,San Jose,CA,US,Alex,Rivera,Owner,alex@proper-handyman.com,Handyman
torreshandymanservice.com,Torres Handyman Service,88 Elm St,San Jose,CA,US,Maria,Torres,Manager,,Handyman
abcroofing.com,ABC Roofing,400 Main St,San Jose,CA,USA,,,,,Roofing`;

type ParseStats = {
  total_rows: number;
  accepted: number;
  skipped_empty: number;
  skipped_invalid: number;
  skipped_invalid_email: number;
  skipped_blocked: number;
  skipped_duplicate: number;
};

type StatusData = {
  run_id: string | null;
  status: string;
  domains_total: number;
  domains_processed: number;
  successful_domains: number;
  emails_found: number;
  qualified_emails: number;
  rejected_emails: number;
  inserted_leads: number;
  duplicates_skipped: number;
  failed_domains: number;
  // Timing (populated after run completes)
  started_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  elapsed_display: string | null;
  avg_domains_per_second: number | null;
  needs_enrichment: number;
};

const POLL_INTERVAL_MS = 2000;

function StatRow({ label, value, color = "#f8fafc", sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.45rem 0", borderBottom: "1px solid #0f172a" }}>
      <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontWeight: 700, fontSize: "1.1rem", color, fontVariantNumeric: "tabular-nums" }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {sub && <div style={{ fontSize: "0.7rem", color: "#475569" }}>{sub}</div>}
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = "#22c55e" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 8, background: "#0f172a", borderRadius: 4, overflow: "hidden", margin: "0.75rem 0" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, transition: "width 0.4s ease", borderRadius: 4 }} />
    </div>
  );
}

export default function ImportContractorWebsitesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [parseStats, setParseStats] = useState<ParseStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollFailsRef = useRef(0);

  const loadStatus = useCallback((id: string) => {
    fetch(`/api/lgs/discovery/runs/${id}/status`)
      .then((r) => r.json())
      .then((json: { ok?: boolean; data?: StatusData }) => {
        if (json.ok && json.data) {
          pollFailsRef.current = 0;
          setStatus(json.data);
        } else {
          pollFailsRef.current++;
        }
      })
      .catch(() => {
        pollFailsRef.current++;
      });
  }, []);

  useEffect(() => {
    if (!runId || !loading) return;
    loadStatus(runId);
    const interval = setInterval(() => loadStatus(runId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runId, loading, loadStatus]);

  useEffect(() => {
    const done = ["complete", "complete_with_errors", "failed", "cancelled"];
    if (status?.status && done.includes(status.status)) {
      setLoading(false);
    }
  }, [status?.status]);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contractor-websites-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setErr(null);
    setStatus(null);
    setParseStats(null);
    setRunId(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/lgs/leads/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        stats?: ParseStats;
        data?: {
          total_rows: number;
          inserted: number;
          skipped: number;
          needs_enrichment: number;
          parse_stats?: ParseStats;
          enrichment_run_ids?: Array<{ campaign_type: string; run_id: string; domains_total: number }>;
        };
      };

      if (res.ok && json.ok && json.data) {
        const firstRunId = json.data.enrichment_run_ids?.[0]?.run_id ?? null;
        setRunId(firstRunId);
        if (json.data.parse_stats) setParseStats(json.data.parse_stats);
        setStatus({
          run_id: firstRunId,
          status: "complete",
          domains_total: json.data.total_rows ?? 0,
          domains_processed: json.data.total_rows ?? 0,
          successful_domains: json.data.inserted ?? 0,
          emails_found: 0,
          qualified_emails: 0,
          rejected_emails: 0,
          inserted_leads: json.data.inserted ?? 0,
          duplicates_skipped: json.data.skipped ?? 0,
          failed_domains: 0,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          elapsed_ms: null,
          elapsed_display: "0s",
          avg_domains_per_second: null,
          needs_enrichment: json.data.needs_enrichment ?? 0,
        });
        setLoading(false);
      } else {
        setErr(json.error ?? "Import failed");
        if (json.stats) setParseStats(json.stats);
        setLoading(false);
      }
    } catch (e) {
      setErr(String(e));
      setLoading(false);
    }
  }

  async function handleCancelConfirm() {
    if (!runId) return;
    setCancelling(true);
    setShowCancelModal(false);
    try {
      await fetch(`/api/lgs/discovery/runs/${runId}/cancel`, { method: "POST" });
      // Status polling will detect "cancel_requested" → "cancelled" automatically
    } catch {
      // silent — polling will surface the state
    } finally {
      setCancelling(false);
    }
  }


  const s = status;
  const domainsTotal = s?.domains_total ?? 0;
  const domainsProcessed = s?.domains_processed ?? 0;
  const progressPct = domainsTotal > 0 ? Math.round((domainsProcessed / domainsTotal) * 100) : 0;
  const isRunning = loading && (s?.status === "running" || s?.status === "cancel_requested");
  const isComplete = s?.status === "complete" || s?.status === "complete_with_errors";
  const isCompleteWithErrors = s?.status === "complete_with_errors";
  const isFailed = s?.status === "failed";
  const isCancelled = s?.status === "cancelled";
  const isCancelRequested = s?.status === "cancel_requested";

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Import Contractor Websites</h1>
        <HelpTooltip text={helpText.importContractorWebsites} />
      </div>
      <p style={{ color: "#64748b", marginBottom: "2rem", fontSize: "0.9rem" }}>
        Upload a CSV or Excel file with contractor leads. Website is required. Company, address, contact name, title, email, and trade are optional. If email is missing, we will automatically search the website for contact details.
      </p>

      {/* Format documentation */}
      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 1rem" }}>
          File Format
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Required column</div>
            <code style={{ color: "#38bdf8", fontSize: "0.85rem" }}>website</code>
            <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "0.2rem" }}>Full URLs are accepted — system strips tracking params</div>
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Optional columns</div>
            <code style={{ color: "#94a3b8", fontSize: "0.85rem" }}>company · address · city · state · country · first_name · last_name · title · email · trade</code>
            <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "0.2rem" }}>Headers are case-insensitive and normalized automatically</div>
          </div>
        </div>

        {/* Example table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", fontFamily: "monospace" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#64748b" }}>
                {["website", "company", "city", "state", "email", "trade"].map((h) => (
                  <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["proper-handyman.com", "Proper Handyman", "San Jose", "CA", "alex@proper-handyman.com", "Handyman"],
                ["torreshandymanservice.com", "Torres Handyman Service", "San Jose", "CA", "", "Handyman"],
                ["https://abc.com/?utm_source=google", "ABC Roofing", "San Jose", "CA", "", "Roofing"],
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #0f172a" }}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: "0.4rem 0.75rem", color: j === 0 ? "#38bdf8" : "#94a3b8" }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: "1rem", display: "flex", gap: "2rem", flexWrap: "wrap", fontSize: "0.78rem", color: "#475569" }}>
          <span>✓ Accepts: CSV, XLSX</span>
          <span>✓ Headers case-insensitive</span>
          <span>✓ Full URLs stripped automatically</span>
          <span>✓ Optional fields supported: Company, Address, Contact Name, Title, Email, Trade</span>
          <span>✗ Skips: Facebook, Instagram, Yelp, etc.</span>
          <span>Max: 10,000 rows · 10 MB</span>
        </div>
      </div>

      {/* Upload form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            type="button"
            onClick={downloadTemplate}
            style={{
              padding: "0.5rem 1rem",
              background: "#334155",
              border: "1px solid #475569",
              borderRadius: 6,
              color: "#e2e8f0",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            ↓ Download Template
          </button>
          <span style={{ color: "#475569", fontSize: "0.8rem" }}>or</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: "0.875rem", color: "#94a3b8" }}
          />
        </div>

        {file && (
          <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "0.75rem" }}>
            Selected: <strong style={{ color: "#94a3b8" }}>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
          </div>
        )}

        <button
          type="submit"
          disabled={!file || loading}
          style={{
            padding: "0.7rem 1.5rem",
            background: !file || loading ? "#1e293b" : "#22c55e",
            color: !file || loading ? "#475569" : "#0f172a",
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            cursor: !file || loading ? "not-allowed" : "pointer",
            fontSize: "0.95rem",
          }}
        >
          {loading ? "Importing leads…" : "Upload & Import"}
        </button>
      </form>

      {err && (
        <div style={{ padding: "0.75rem 1rem", background: "#3b1a1a", border: "1px solid #7f1d1d", borderRadius: 8, color: "#fca5a5", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {err}
        </div>
      )}

      {/* Parse stats (shown on error or after upload) */}
      {parseStats && !isRunning && !isComplete && (
        <div style={{ padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8, marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "0.5rem", fontWeight: 600 }}>File parse results</div>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.82rem" }}>
            <span>Rows read: <strong style={{ color: "#f8fafc" }}>{parseStats.total_rows}</strong></span>
            <span style={{ color: "#4ade80" }}>Accepted: <strong>{parseStats.accepted}</strong></span>
            {parseStats.skipped_blocked > 0 && <span style={{ color: "#f87171" }}>Social media skipped: <strong>{parseStats.skipped_blocked}</strong></span>}
            {parseStats.skipped_invalid > 0 && <span style={{ color: "#f87171" }}>Invalid URL: <strong>{parseStats.skipped_invalid}</strong></span>}
            {parseStats.skipped_invalid_email > 0 && <span style={{ color: "#f87171" }}>Invalid email: <strong>{parseStats.skipped_invalid_email}</strong></span>}
            {parseStats.skipped_duplicate > 0 && <span style={{ color: "#94a3b8" }}>Duplicates: <strong>{parseStats.skipped_duplicate}</strong></span>}
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showCancelModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: "2rem", maxWidth: 420, width: "90%", border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem", color: "#f8fafc" }}>Cancel Domain Discovery?</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
              Stopping the scan will halt discovery immediately. <strong style={{ color: "#f8fafc" }}>Leads already created</strong> during this scan will be kept. Unscanned domains will be skipped.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{ padding: "0.55rem 1.1rem", background: "transparent", border: "1px solid #475569", borderRadius: 7, color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Continue Scan
              </button>
              <button
                onClick={handleCancelConfirm}
                style={{ padding: "0.55rem 1.1rem", background: "#dc2626", border: "none", borderRadius: 7, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress panel */}
      {(isRunning || isComplete || isFailed || isCancelled) && s && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              {isCompleteWithErrors ? "Import Complete with Warnings" : isComplete ? "Import Complete" : isFailed ? "Import Failed" : isCancelled ? "Discovery Cancelled" : "Import Progress"}
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              {/* Cancel button — only shown while actively running */}
              {isRunning && !isCancelRequested && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  disabled={cancelling}
                  style={{
                    padding: "0.3rem 0.85rem",
                    background: "#450a0a",
                    border: "1px solid #dc2626",
                    borderRadius: 6,
                    color: "#f87171",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  Cancel Scan
                </button>
              )}
              {isCancelRequested && (
                <span style={{ fontSize: "0.78rem", color: "#f87171", fontStyle: "italic" }}>
                  Cancelling…
                </span>
              )}
              <span style={{
                padding: "0.2rem 0.6rem",
                borderRadius: 4,
                fontSize: "0.75rem",
                fontWeight: 600,
                background: isCompleteWithErrors ? "#2d1a00" : isComplete ? "#1e3a2f" : isFailed ? "#3b1a1a" : isCancelled ? "#450a0a" : "#1a2b3d",
                color: isCompleteWithErrors ? "#fbbf24" : isComplete ? "#4ade80" : isFailed ? "#f87171" : isCancelled ? "#f87171" : "#60a5fa",
              }}>
                {isCompleteWithErrors ? "⚠ With Errors" : isComplete ? "Complete" : isFailed ? "Failed" : isCancelled ? "Cancelled" : `${progressPct}%`}
              </span>
            </div>
          </div>

          {isRunning && (
            <ProgressBar pct={progressPct} color={isCancelRequested ? "#ef4444" : progressPct === 100 ? "#22c55e" : "#3b82f6"} />
          )}

          <div style={{ marginTop: "0.5rem" }}>
            <StatRow label="Domains Uploaded" value={domainsTotal} color="#f8fafc" />
            <StatRow label="Domains Scanned" value={domainsProcessed} color={isComplete ? "#f8fafc" : "#60a5fa"} sub={domainsTotal > 0 ? `of ${domainsTotal}` : undefined} />
            <StatRow label="Leads Created" value={s.inserted_leads ?? 0} color="#4ade80" sub="new leads added" />
            <StatRow label="Duplicates Skipped" value={s.duplicates_skipped ?? 0} color="#94a3b8" sub="existing row preserved" />
            <StatRow label="Needs Enrichment" value={s.needs_enrichment ?? 0} color="#fbbf24" sub="website queued for contact discovery" />
            {(s.failed_domains ?? 0) > 0 && (
              <StatRow label="Failed Domains" value={s.failed_domains} color="#f87171" sub="unreachable" />
            )}
          </div>

          {/* Partial-failure notice */}
          {isCompleteWithErrors && (s?.failed_domains ?? 0) > 0 && (
            <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.85rem", background: "#2d1a0022", border: "1px solid #f59e0b44", borderRadius: 7, fontSize: "0.82rem", color: "#fbbf24" }}>
              <strong>{s?.failed_domains}</strong> domain{(s?.failed_domains ?? 0) !== 1 ? "s" : ""} could not be scanned (DNS failure, SSL error, or timeout). All other domains were processed and leads created normally.
            </div>
          )}

          {/* Discovery Runtime panel — shown once timing data is available */}
          {(isComplete || isRunning) && (s.started_at || s.elapsed_display) && (
            <div style={{ marginTop: "1.25rem", borderTop: "1px solid #334155", paddingTop: "1.25rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
                Discovery Runtime
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 2rem", fontSize: "0.875rem" }}>
                {s.started_at && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #0f172a", padding: "0.35rem 0" }}>
                    <span style={{ color: "#94a3b8" }}>Started</span>
                    <span style={{ color: "#f8fafc", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {new Date(s.started_at).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {s.finished_at && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #0f172a", padding: "0.35rem 0" }}>
                    <span style={{ color: "#94a3b8" }}>Finished</span>
                    <span style={{ color: "#f8fafc", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {new Date(s.finished_at).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {s.elapsed_display && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #0f172a", padding: "0.35rem 0" }}>
                    <span style={{ color: "#94a3b8" }}>Elapsed Time</span>
                    <span style={{ color: "#fbbf24", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {s.elapsed_display}
                    </span>
                  </div>
                )}
                {s.avg_domains_per_second !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #0f172a", padding: "0.35rem 0" }}>
                    <span style={{ color: "#94a3b8" }}>Avg Scan Speed</span>
                    <span style={{ color: "#34d399", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {s.avg_domains_per_second} domains/sec
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {isCancelled && (
            <div style={{ marginTop: "1.25rem", padding: "1rem", background: "#1e2a1e", border: "1px solid #166534", borderRadius: 8 }}>
              <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: "0.35rem" }}>Discovery Cancelled</div>
              <div style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                {(s.inserted_leads ?? 0) > 0
                  ? `${(s.inserted_leads ?? 0).toLocaleString()} leads were created before cancellation and are available in your database.`
                  : "Scan was cancelled before any leads were created."}
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {(s.inserted_leads ?? 0) > 0 && (
                  <Link
                    href="/leads"
                    style={{ padding: "0.5rem 1rem", background: "#22c55e", borderRadius: 7, color: "#0f172a", fontWeight: 700, textDecoration: "none", fontSize: "0.875rem" }}
                  >
                    View {(s.inserted_leads ?? 0).toLocaleString()} Leads →
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => { setStatus(null); setFile(null); setRunId(null); setParseStats(null); setErr(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 7, color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}
                >
                  Start New Scan
                </button>
              </div>
            </div>
          )}

          {isComplete && (
            <div style={{ marginTop: "1.25rem" }}>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <Link
                  href="/leads"
                  style={{
                    padding: "0.55rem 1.1rem",
                    background: isCompleteWithErrors ? "#f59e0b" : "#22c55e",
                    borderRadius: 7,
                    color: "#0f172a",
                    fontWeight: 700,
                    textDecoration: "none",
                    fontSize: "0.9rem",
                  }}
                >
                  View {(s.inserted_leads ?? 0).toLocaleString()} New Leads →
                </Link>
                <button
                  type="button"
                  onClick={() => { setStatus(null); setFile(null); setRunId(null); setParseStats(null); setErr(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 7, color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}
                >
                  Import Another File
                </button>
              </div>
              {(s.inserted_leads ?? 0) > 0 && (
                <div style={{ marginTop: "0.85rem", padding: "0.6rem 0.85rem", background: "#1a2b3d", border: "1px solid #334155", borderRadius: 7, fontSize: "0.82rem", color: "#94a3b8" }}>
                  {s.needs_enrichment > 0
                    ? "Rows without email were inserted and queued for website enrichment automatically."
                    : "Rows with email were inserted directly and are ready for downstream verification/outreach."}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pipeline explanation */}
      {!isRunning && !isComplete && !isCancelled && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
          <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.85rem" }}>
            What happens after upload
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.85rem" }}>
            {[
              ["1", "Parse CSV / XLSX", "Normalize website and optional structured fields"],
              ["2", "Validate each row", "Reject rows with no website or invalid email"],
              ["3", "Insert or update leads", "Conservative duplicate handling fills blank fields only"],
              ["4", "Flag missing email", "Rows without email are marked for enrichment"],
              ["5", "Queue website discovery", "Contact discovery runs asynchronously"],
              ["6", "Ready for outreach", "Rows with email can move downstream immediately"],
              ["7", "Background verification", "DNS/SMTP verification still runs after import"],
            ].map(([num, step, detail]) => (
              <div key={num} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                <span style={{ color: "#334155", fontWeight: 700, minWidth: 18, fontFamily: "monospace" }}>{num}.</span>
                <span style={{ color: "#e2e8f0", fontWeight: 500, minWidth: 160 }}>{step}</span>
                <span style={{ color: "#475569" }}>{detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href="/leads" style={{ display: "inline-block", marginTop: "1.5rem", color: "#64748b", fontSize: "0.875rem" }}>
        ← Back to Leads
      </Link>
    </div>
  );
}
