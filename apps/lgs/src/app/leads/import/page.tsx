"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";
import { formatNumber } from "@/lib/formatters";

const CSV_TEMPLATE = `website,city,state,country
proper-handyman.com,San Jose,CA,US
torreshandymanservice.com,San Jose,CA,US
abcroofing.com,San Jose,CA,US`;

type ParseStats = {
  total_rows: number;
  accepted: number;
  skipped_empty: number;
  skipped_invalid: number;
  skipped_blocked: number;
  skipped_duplicate: number;
};

type LeadType = "contractor" | "job_poster";

type StatusData = {
  run_id: string;
  status: string;
  raw_status?: string;
  lead_type?: LeadType;
  domains_total: number;
  domains_processed: number;
  progress_pct?: number;
  successful_domains: number;
  emails_found: number;
  qualified_emails: number;
  rejected_emails: number;
  inserted_leads: number;
  duplicates_skipped: number;
  failed_domains: number;
  heartbeat_at?: string | null;
  stalled?: boolean;
  // Timing (populated after run completes)
  started_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  elapsed_display: string | null;
  avg_domains_per_second: number | null;
};

const POLL_INTERVAL_MS = 2000;

function StatRow({ label, value, color = "#f8fafc", sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.45rem 0", borderBottom: "1px solid #0f172a" }}>
      <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontWeight: 700, fontSize: "1.1rem", color, fontVariantNumeric: "tabular-nums" }}>
          {typeof value === "number" ? formatNumber(value) : value}
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
  const [leadType, setLeadType] = useState<LeadType>("contractor");
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [parseStats, setParseStats] = useState<ParseStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollFailsRef = useRef(0);
  const lastMeaningfulUpdateRef = useRef<number>(Date.now());
  const previousSnapshotRef = useRef<string>("");
  const [pollFailures, setPollFailures] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());

  const loadStatus = useCallback((id: string) => {
    fetch(`/api/lgs/discovery/runs/${id}/status`)
      .then((r) => r.json())
      .then((json: { ok?: boolean; data?: StatusData }) => {
        if (json.ok && json.data) {
          pollFailsRef.current = 0;
          setPollFailures(0);
          const snapshot = [
            json.data.status,
            json.data.domains_processed,
            json.data.inserted_leads,
            json.data.failed_domains,
            json.data.duplicates_skipped,
            json.data.heartbeat_at ?? "",
          ].join("|");
          if (snapshot !== previousSnapshotRef.current) {
            previousSnapshotRef.current = snapshot;
            lastMeaningfulUpdateRef.current = Date.now();
          }
          setStatus(json.data);
        } else {
          pollFailsRef.current++;
          setPollFailures(pollFailsRef.current);
        }
      })
      .catch(() => {
        pollFailsRef.current++;
        setPollFailures(pollFailsRef.current);
      });
  }, []);

  useEffect(() => {
    const done = ["complete", "complete_with_errors", "failed", "cancelled"];
    if (!runId || (status?.status && done.includes(status.status))) return;
    loadStatus(runId);
    const interval = setInterval(() => loadStatus(runId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runId, status?.status, loadStatus]);

  useEffect(() => {
    const done = ["complete", "complete_with_errors", "failed", "cancelled"];
    if (status?.status && done.includes(status.status)) {
      setLoading(false);
    }
  }, [status?.status]);

  useEffect(() => {
    if (!runId) return;
    const interval = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runId]);

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
    setPollFailures(0);
    previousSnapshotRef.current = "";
    lastMeaningfulUpdateRef.current = Date.now();
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("lead_type", leadType);
      const res = await fetch("/api/lgs/leads/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        stats?: ParseStats;
        data?: { run_id: string; domains_total: number; lead_type?: LeadType; parse_stats?: ParseStats };
      };

      if (res.ok && json.ok && json.data) {
        setRunId(json.data.run_id);
        if (json.data.parse_stats) setParseStats(json.data.parse_stats);
        setStatus({
          run_id: json.data.run_id,
          status: "running",
          lead_type: json.data.lead_type ?? leadType,
          domains_total: json.data.domains_total ?? 0,
          domains_processed: 0,
          progress_pct: 0,
          successful_domains: 0,
          emails_found: 0,
          qualified_emails: 0,
          rejected_emails: 0,
          inserted_leads: 0,
          duplicates_skipped: 0,
          failed_domains: 0,
          heartbeat_at: null,
          stalled: false,
          started_at: null,
          finished_at: null,
          elapsed_ms: null,
          elapsed_display: null,
          avg_domains_per_second: null,
        });
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
  const progressPct = s?.progress_pct ?? (domainsTotal > 0 ? Math.round((domainsProcessed / domainsTotal) * 100) : 0);
  const isRunning = Boolean(runId) && (s?.status === "running" || s?.status === "cancel_requested" || s?.status === "stalled");
  const isComplete = s?.status === "complete" || s?.status === "complete_with_errors";
  const isCompleteWithErrors = s?.status === "complete_with_errors";
  const isFailed = s?.status === "failed";
  const isCancelled = s?.status === "cancelled";
  const isCancelRequested = s?.status === "cancel_requested";
  const isStalled = s?.status === "stalled" || s?.stalled === true;
  const activeLeadType = s?.lead_type ?? leadType;
  const inactiveMs = nowTs - lastMeaningfulUpdateRef.current;
  const showStillProcessing = isRunning && !isStalled && inactiveMs >= 15_000;
  const leadTypeLabel = activeLeadType === "job_poster" ? "Job Poster Leads" : "Contractor Leads";

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Import Leads</h1>
        <HelpTooltip text={helpText.importContractorWebsites} />
      </div>
      <p style={{ color: "#64748b", marginBottom: "2rem", fontSize: "0.9rem" }}>
        Upload a CSV or Excel file with websites. The system will crawl each site, extract emails, and create lead records in the correct pipeline. Email verification runs in the background afterward.
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
            <code style={{ color: "#94a3b8", fontSize: "0.85rem" }}>city · state · country · lead_type</code>
            <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "0.2rem" }}>USA → US converted automatically · `lead_type` supports contractor or job_poster</div>
          </div>
        </div>

        {/* Example table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", fontFamily: "monospace" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#64748b" }}>
                {["website", "city", "state", "country", "lead_type"].map((h) => (
                  <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["proper-handyman.com", "San Jose", "CA", "US", "contractor"],
                ["torreshandymanservice.com", "San Jose", "CA", "US", "contractor"],
                ["https://abc.com/?utm_source=google", "San Jose", "CA", "USA", "job_poster"],
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

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.4rem" }}>
            Lead Type
          </label>
          <select
            value={leadType}
            onChange={(e) => setLeadType(e.target.value as LeadType)}
            disabled={loading}
            style={{
              padding: "0.65rem 0.8rem",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: "0.9rem",
              minWidth: 240,
            }}
          >
            <option value="contractor">Contractor Leads</option>
            <option value="job_poster">Job Poster Leads</option>
          </select>
        </div>

        {file && (
          <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "0.75rem" }}>
            Selected: <strong style={{ color: "#94a3b8" }}>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
            <div style={{ marginTop: "0.25rem" }}>
              Importing as: <strong style={{ color: "#f8fafc" }}>{leadTypeLabel}</strong>
            </div>
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
          {loading ? "Scanning websites…" : "Upload & Import"}
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
                {isCompleteWithErrors ? "⚠ With Errors" : isComplete ? "Complete" : isFailed ? "Failed" : isCancelled ? "Cancelled" : isStalled ? "Delayed" : `${progressPct}%`}
              </span>
            </div>
          </div>

          {isRunning && (
            <ProgressBar pct={progressPct} color={isCancelRequested ? "#ef4444" : progressPct === 100 ? "#22c55e" : "#3b82f6"} />
          )}

          {isRunning && (
            <div style={{ marginTop: "0.5rem", padding: "0.75rem 0.9rem", background: isStalled ? "#3b2a12" : "#13263a", border: `1px solid ${isStalled ? "#92400e" : "#1d4ed8"}`, borderRadius: 8, color: isStalled ? "#fdba74" : "#93c5fd", fontSize: "0.84rem" }}>
              <strong style={{ color: isStalled ? "#fed7aa" : "#dbeafe" }}>
                {isStalled ? "Processing delayed — retrying..." : showStillProcessing ? "Still processing — scanning domains..." : "Scan in progress"}
              </strong>
              <div style={{ marginTop: "0.25rem", color: isStalled ? "#fdba74" : "#93c5fd" }}>
                Importing as: {leadTypeLabel}
                {pollFailures > 0 ? ` · reconnecting to progress updates (${pollFailures})` : ""}
              </div>
            </div>
          )}

          <div style={{ marginTop: "0.5rem" }}>
            <StatRow label="Domains Uploaded" value={domainsTotal} color="#f8fafc" />
            <StatRow label="Domains Scanned" value={domainsProcessed} color={isComplete ? "#f8fafc" : "#60a5fa"} sub={domainsTotal > 0 ? `of ${domainsTotal}` : undefined} />
            <StatRow label="Emails Found" value={s.emails_found ?? 0} color="#a78bfa" sub="all extracted" />
            <StatRow label="Rejected Emails" value={s.rejected_emails ?? 0} color="#f87171" sub="noise / automated" />
            <StatRow label="Leads Created" value={s.inserted_leads ?? 0} color="#4ade80" sub={isRunning ? "live — updating now" : "new leads added"} />
            <StatRow label="Duplicates Skipped" value={s.duplicates_skipped ?? 0} color="#94a3b8" sub="domain already in DB" />
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
                  ? `${formatNumber(s.inserted_leads ?? 0)} leads were created before cancellation and are available in your database.`
                  : "Scan was cancelled before any leads were created."}
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {(s.inserted_leads ?? 0) > 0 && (
                  <Link
                    href="/leads"
                    style={{ padding: "0.5rem 1rem", background: "#22c55e", borderRadius: 7, color: "#0f172a", fontWeight: 700, textDecoration: "none", fontSize: "0.875rem" }}
                  >
                    View {formatNumber(s.inserted_leads ?? 0)} Leads →
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => { setStatus(null); setFile(null); setRunId(null); setParseStats(null); setErr(null); setPollFailures(0); previousSnapshotRef.current = ""; lastMeaningfulUpdateRef.current = Date.now(); if (fileInputRef.current) fileInputRef.current.value = ""; }}
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
                  View {formatNumber(s.inserted_leads ?? 0)} New Leads →
                </Link>
                <button
                  type="button"
                  onClick={() => { setStatus(null); setFile(null); setRunId(null); setParseStats(null); setErr(null); setPollFailures(0); previousSnapshotRef.current = ""; lastMeaningfulUpdateRef.current = Date.now(); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 7, color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}
                >
                  Import Another File
                </button>
              </div>
              {(s.inserted_leads ?? 0) > 0 && (
                <div style={{ marginTop: "0.85rem", padding: "0.6rem 0.85rem", background: "#1a2b3d", border: "1px solid #334155", borderRadius: 7, fontSize: "0.82rem", color: "#94a3b8" }}>
                  Leads are created with <strong style={{ color: "#fbbf24" }}>pending</strong> verification status. Run the verification worker to process them in the background without blocking imports:
                  <code style={{ display: "block", marginTop: "0.4rem", padding: "0.3rem 0.5rem", background: "#0f172a", borderRadius: 4, color: "#38bdf8", fontSize: "0.78rem" }}>
                    npx tsx apps/api/scripts/lgs-email-enrichment-worker.ts --once
                  </code>
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
              ["1", "Parse CSV / XLSX", "Extract website, city, state, country"],
              ["2", "Normalize domains", "Strip URLs, tracking params, paths"],
              ["3", "Crawl each website", "10 parallel workers · 5s timeout · 4 pages"],
              ["4", "Extract & filter emails", "Regex extraction · reject spam addresses"],
              ["5", "Deduplicate by domain", "One lead per company domain"],
              ["6", "Create leads instantly", "No verification wait — leads appear in real time"],
              ["7", "Background enrichment", "DNS/SMTP verification runs after import"],
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
