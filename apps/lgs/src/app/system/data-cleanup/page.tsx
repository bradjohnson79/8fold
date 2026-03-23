"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/formatters";

type ConsolidateResult = {
  domains_analyzed: number;
  duplicate_domains: number;
  leads_before: number;
  leads_after: number;
  leads_removed: number;
  preview: boolean;
};

function StatCard({
  title,
  value,
  sub,
  color = "#f8fafc",
}: {
  title: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div
        style={{
          fontSize: "0.78rem",
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.35rem",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color }}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {sub && (
        <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.2rem" }}>{sub}</div>
      )}
    </div>
  );
}

export default function DataCleanupPage() {
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<ConsolidateResult | null>(null);
  const [result, setResult] = useState<ConsolidateResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setScanning(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetch("/api/lgs/leads/consolidate?preview=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "scan_failed");
      setPreview(json.data as ConsolidateResult);
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleConsolidate() {
    setShowModal(false);
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/lgs/leads/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: false }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "consolidate_failed");
      setResult(json.data as ConsolidateResult);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consolidation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 860, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#f8fafc" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Data Cleanup</h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", fontSize: "0.9rem" }}>
        Tools for maintaining a clean and deduplicated lead database.
      </p>

      {/* ── Company Email Consolidation ─────────────────────────────── */}
      <section
        style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 10,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Company Email Consolidation
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          When multiple emails were discovered for the same company domain, they each became
          a separate lead. This tool merges them into{" "}
          <strong style={{ color: "#f1f5f9" }}>one lead per company</strong>, selecting the
          best outreach email (personal name → sales → info → support) and preserving all
          other emails internally.
        </p>

        {/* Email selection legend */}
        <div
          style={{
            background: "#1e293b",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1.25rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.5rem",
          }}
        >
          {[
            { label: "Preferred: personal name (john@, sarah@)", token: "A", color: "#4ade80" },
            { label: "Allowed: business contact (sales@, contracts@)", token: "B", color: "#60a5fa" },
            { label: "Fallback: general inbox (info@, contact@)", token: "C", color: "#94a3b8" },
            { label: "Deprioritized: support/admin inbox", token: "D", color: "#475569" },
            { label: "Rejected: noreply, test, sentry", token: "X", color: "#f87171" },
          ].map((item) => (
            <div key={item.token} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
              <span
                style={{
                  display: "inline-block",
                  minWidth: 36,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: item.token === "X" ? "#3b1a1a" : "#0f172a",
                  color: item.color,
                  fontWeight: 700,
                  fontSize: "0.72rem",
                  textAlign: "center",
                }}
              >
                {item.token}
              </span>
              <span style={{ color: "#94a3b8" }}>{item.label}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleScan}
          disabled={scanning || running}
          style={{
            padding: "0.6rem 1.4rem",
            background: scanning || running ? "#1e293b" : "#3b82f6",
            color: scanning || running ? "#64748b" : "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: scanning || running ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
          }}
        >
          {scanning ? "Scanning..." : running ? "Consolidating..." : "Consolidate Company Emails"}
        </button>
      </section>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: "#3b1a1a",
            border: "1px solid #f87171",
            borderRadius: 8,
            padding: "1rem",
            color: "#f87171",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Success result ───────────────────────────────────────────── */}
      {result && (
        <section
          style={{
            background: "#0f2e1f",
            border: "1px solid #22c55e",
            borderRadius: 10,
            padding: "1.5rem",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#4ade80", marginBottom: "1rem" }}>
            Consolidation Complete
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <StatCard title="Domains Analyzed" value={result.domains_analyzed} />
            <StatCard title="Duplicate Domains" value={result.duplicate_domains} color="#f59e0b" />
            <StatCard title="Leads Before" value={result.leads_before} />
            <StatCard
              title="Leads Removed"
              value={result.leads_removed}
              color={result.leads_removed > 0 ? "#f87171" : "#4ade80"}
            />
            <StatCard title="Leads After" value={result.leads_after} color="#4ade80" />
          </div>
          {result.leads_removed > 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
              {formatNumber(result.leads_removed)} duplicate lead{result.leads_removed !== 1 ? "s" : ""} removed.
              Each company now has exactly one outreach lead with the best email selected as primary.
            </p>
          ) : (
            <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
              No duplicate domain leads were found. Your database is already consolidated.
            </p>
          )}
        </section>
      )}

      {/* ── Confirmation Modal ───────────────────────────────────────── */}
      {showModal && preview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: "2rem",
              maxWidth: 480,
              width: "90%",
            }}
          >
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Consolidate Company Emails?
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              This will merge duplicate domain leads, keeping the best outreach email per company and storing others internally.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ background: "#1e293b", borderRadius: 8, padding: "0.75rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Domains with Duplicates
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f59e0b" }}>
                  {formatNumber(preview.duplicate_domains)}
                </div>
              </div>
              <div style={{ background: "#1e293b", borderRadius: 8, padding: "0.75rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Leads Before
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                  {formatNumber(preview.leads_before)}
                </div>
              </div>
              <div style={{ background: "#3b1a1a", borderRadius: 8, padding: "0.75rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Leads to Remove
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f87171" }}>
                  {formatNumber(preview.leads_removed)}
                </div>
              </div>
              <div style={{ background: "#0f2e1f", borderRadius: 8, padding: "0.75rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Leads After
                </div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#4ade80" }}>
                  {formatNumber(preview.leads_after)}
                </div>
              </div>
            </div>

            {preview.duplicate_domains === 0 ? (
              <div style={{ marginBottom: "1rem", color: "#64748b", fontSize: "0.875rem" }}>
                No duplicate domain leads found. Nothing to consolidate.
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: "0.55rem 1.2rem",
                  background: "#1e293b",
                  color: "#94a3b8",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Cancel
              </button>
              {preview.duplicate_domains > 0 && (
                <button
                  onClick={handleConsolidate}
                  style={{
                    padding: "0.55rem 1.2rem",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                  }}
                >
                  Run Consolidation
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
