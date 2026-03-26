"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { VerificationProgressModal, type VerificationProgress } from "@/components/VerificationProgressModal";

type JobPosterLead = {
  id: string;
  website: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  processing_status?: "new" | "enriching" | "processed" | null;
  needs_enrichment?: boolean;
  assignment_status?: string | null;
  outreach_status?: string | null;
  email_verification_status?: string | null;
  email_verification_score?: number | null;
  priority_score?: number;
  lead_priority?: string | null;
  category: string;
  city: string | null;
  state: string | null;
  status: string;
  response_received: boolean;
  reply_count?: number;
  last_replied_at: string | null;
  created_at: string | null;
  archived?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
  final_status?: "ready" | "risky" | "archived";
  ready_for_outreach?: boolean;
  ui_verification_status?: string | null;
};

type EnrichmentSummary = {
  active: number;
  sendable: number;
  needs_attention: number;
  unusable: number;
};

type ApiResponse = {
  ok: boolean;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  enrichment?: EnrichmentSummary;
  data: JobPosterLead[];
  error?: string;
};

type VerificationJob = {
  title: string;
  summary: string | null;
  pipeline: "jobs";
  leadIds: string[];
  allPending: boolean;
};

const VERIFY_STATUS_COLORS: Record<string, string> = {
  pending: "#fbbf24",
  valid: "#22c55e",
  verified: "#22c55e",
  invalid: "#ef4444",
  unknown: "#fbbf24",
  risky: "#fbbf24",
  catch_all: "#fbbf24",
  processing: "#fbbf24",
};

function badgeStyle(color: string) {
  return {
    background: `${color}22`,
    color,
    borderRadius: 999,
    border: `1px solid ${color}44`,
    padding: "0.2rem 0.55rem",
    whiteSpace: "nowrap" as const,
  };
}

function normalizeVerificationStatus(status?: string | null): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return "pending";
  if (normalized === "valid" || normalized === "verified") return "valid";
  if (normalized === "invalid") return "invalid";
  return "pending";
}

function verificationLabel(status?: string | null): string {
  const normalized = normalizeVerificationStatus(status);
  if (normalized === "valid") return "Valid";
  if (normalized === "invalid") return "Invalid";
  return normalized.replace(/_/g, " ");
}

function finalStatusLabel(status?: string | null, reason?: string | null): string {
  void reason;
  return status === "archived" ? "Archived" : "Active";
}

export default function JobPosterLeadsPage() {
  const [leads, setLeads] = useState<JobPosterLead[]>([]);
  const [enrichment, setEnrichment] = useState<EnrichmentSummary | null>(null);
  const [search, setSearch] = useState("");
  const [filterActionability, setFilterActionability] = useState<"active" | "sendable" | "needs_attention" | "unusable">("active");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [verifyPendingRunning, setVerifyPendingRunning] = useState(false);
  const [verificationJob, setVerificationJob] = useState<VerificationJob | null>(null);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("filter_actionability", filterActionability);
      const res = await lgsFetch<ApiResponse>(`/api/lgs/job-poster-leads?${params.toString()}`);
      const data = res as unknown as ApiResponse;
      if (data.ok) {
        setLeads(data.data ?? []);
        if (data.enrichment) setEnrichment(data.enrichment);
      } else {
        setError(data.error ?? "Failed to load job poster leads");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [search, filterActionability]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!verificationJob) return;

    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams({
        pipeline: verificationJob.pipeline,
      });
      if (verificationJob.allPending) {
        params.set("all_pending", "true");
      } else if (verificationJob.leadIds.length > 0) {
        params.set("lead_ids", verificationJob.leadIds.join(","));
      }

      try {
        const res = await lgsFetch<VerificationProgress>(`/api/lgs/verification/status?${params.toString()}`);
        const payload = res as unknown as { ok: boolean; data?: VerificationProgress };
        if (!cancelled && payload.ok && payload.data) {
          setVerificationProgress(payload.data);
        }
      } catch {
        // Ignore transient polling failures.
      }
    };

    void run();
    const timer = setInterval(() => {
      void run();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [verificationJob]);

  const displayedLeads = useMemo(() => leads, [leads]);

  const allSelected = displayedLeads.length > 0 && displayedLeads.every((lead) => selected.has(lead.id));
  const selectedLeads = displayedLeads.filter((lead) => selected.has(lead.id));
  const verifiableLeads = selectedLeads.filter((lead) => !!lead.email && normalizeVerificationStatus(lead.email_verification_status) !== "valid");

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        displayedLeads.forEach((lead) => next.delete(lead.id));
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      displayedLeads.forEach((lead) => next.add(lead.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function queueVerify(allPending = false) {
    if (!allPending && verifiableLeads.length === 0) return;
    setBulkMsg(null);
    if (allPending) setVerifyPendingRunning(true);
    else setBulkVerifying(true);
    try {
      const res = await fetch("/api/lgs/leads/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline: "jobs",
          lead_ids: allPending ? [] : verifiableLeads.map((lead) => lead.id),
          all_pending: allPending,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { queued?: number; cached?: number; alreadyQueued?: number; invalid?: number; skipped?: number; accepted?: number };
        error?: string;
      };
      if (res.ok) {
        const queued = json.data?.queued ?? 0;
        const cached = json.data?.cached ?? 0;
        const alreadyQueued = json.data?.alreadyQueued ?? 0;
        const invalid = json.data?.invalid ?? 0;
        const skipped = json.data?.skipped ?? 0;
        setBulkMsg(
          `Verification queued: ${queued}` +
          (cached > 0 ? `, reused cached: ${cached}` : "") +
          (alreadyQueued > 0 ? `, already queued: ${alreadyQueued}` : "") +
          (invalid > 0 ? `, invalid: ${invalid}` : "") +
          (skipped > 0 ? `, skipped: ${skipped}` : "")
        );
        setVerificationJob({
          title: allPending ? "Verifying Pending Job Poster Leads" : `Verifying Selected Job Poster Leads (${verifiableLeads.length})`,
          summary:
            `Queued ${queued}` +
            (cached ? `, reused cached ${cached}` : "") +
            (alreadyQueued ? `, already queued ${alreadyQueued}` : "") +
            (invalid ? `, invalid ${invalid}` : "") +
            (skipped ? `, skipped ${skipped}` : ""),
          pipeline: "jobs",
          leadIds: allPending ? [] : verifiableLeads.map((lead) => lead.id),
          allPending,
        });
        setVerificationProgress(null);
        void load();
      } else {
        setBulkMsg(json.error ?? "Verification queue failed");
      }
    } finally {
      setBulkVerifying(false);
      setVerifyPendingRunning(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Job Poster Leads</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
            Active job poster leads with processing visibility for the jobs pipeline.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => void queueVerify(true)}
            disabled={verifyPendingRunning}
            style={{ padding: "0.6rem 1rem", background: "transparent", border: "1px solid #22c55e66", borderRadius: 8, color: "#4ade80", cursor: verifyPendingRunning ? "not-allowed" : "pointer" }}
          >
            {verifyPendingRunning ? "Queueing Verify…" : "Verify Pending"}
          </button>
          <Link href="/leads/finder" style={{ padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8 }}>
            Open Lead Finder
          </Link>
        </div>
      </div>

      {/* Actionability tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(
          [
            { key: "active", label: "Active", color: "#38bdf8", dimColor: "#0c4a6e33", borderColor: "#38bdf866" },
            { key: "sendable", label: "Ready to Send", color: "#22c55e", dimColor: "#16a34a33", borderColor: "#22c55e66" },
            { key: "needs_attention", label: "Processing", color: "#f59e0b", dimColor: "#f59e0b22", borderColor: "#f59e0b66" },
            { key: "unusable", label: "Not Ready", color: "#64748b", dimColor: "#1e293b", borderColor: "#334155" },
          ] as const
        ).map(({ key, label, color, dimColor, borderColor }) => {
          const active = filterActionability === key;
          const count = enrichment?.[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setFilterActionability(key)}
              style={{
                padding: "0.55rem 1.1rem",
                background: active ? dimColor : "transparent",
                border: `1px solid ${active ? borderColor : "#334155"}`,
                borderRadius: 8,
                color: active ? color : "#64748b",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "all 0.15s",
              }}
            >
              {label}
              <span style={{
                fontSize: "0.75rem",
                background: active ? `${color}33` : "#1e293b",
                color: active ? color : "#475569",
                borderRadius: 12,
                padding: "0.1rem 0.45rem",
                fontWeight: 600,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary filters */}
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search website, company, category, city..."
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#f8fafc",
            padding: "0.6rem 0.8rem",
          }}
        />
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {bulkMsg && <p style={{ color: bulkMsg.toLowerCase().includes("failed") ? "#f87171" : "#4ade80" }}>{bulkMsg}</p>}
      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}

      {!loading && displayedLeads.length === 0 && !error && (
        <div style={{ padding: "2rem", background: "#1e293b", borderRadius: 10, color: "#94a3b8" }}>
          No job poster leads found.
        </div>
      )}

      {selectedLeads.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem", padding: "0.75rem 1rem", background: "#1e293b", borderRadius: 8, border: "1px solid #334155" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{selectedLeads.length} selected</span>
          {verifiableLeads.length > 0 && (
            <button
              onClick={() => void queueVerify(false)}
              disabled={bulkVerifying}
              style={{ padding: "0.4rem 0.875rem", background: "#14532d", border: "1px solid #22c55e66", borderRadius: 6, color: "#bbf7d0", fontSize: "0.875rem", cursor: bulkVerifying ? "not-allowed" : "pointer" }}
            >
              {bulkVerifying ? "Queueing Verify…" : `Verify Selected (${verifiableLeads.length})`}
            </button>
          )}
          <button
            onClick={() => setSelected(new Set())}
            style={{ padding: "0.4rem 0.75rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", cursor: "pointer" }}
          >
            Deselect
          </button>
        </div>
      )}

      {displayedLeads.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#64748b" }}>
                {["", "Website", "Company", "Contact", "Email", "Verify Status", "Processing", "Category", "City", "Assignment", "Outreach", "Status", "Reply Count", "Replied", "Last Replied", "Created At"].map((label, index) => (
                  <th key={label} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>
                    {index === 0 ? <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} /> : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedLeads.map((lead) => (
                <tr
                  key={lead.id}
                  style={{
                    borderBottom: "1px solid #0f172a",
                    background: lead.archived ? "#2d1a0a33" : "transparent",
                    opacity: lead.archived ? 0.78 : 1,
                  }}
                >
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <a href={`https://${lead.website}`} target="_blank" rel="noreferrer" style={{ color: "#38bdf8" }}>
                      {lead.website}
                    </a>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    {lead.company_name ?? "—"}
                    {lead.archived && (
                      <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", background: "#2d1a0a", border: "1px solid #f59e0b66", color: "#f59e0b", borderRadius: 3, padding: "0.1rem 0.35rem", fontWeight: 600, verticalAlign: "middle" }}>
                        Archived
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{lead.contact_name ?? "—"}</td>
                  <td style={{ padding: "0.6rem 0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#94a3b8" }}>
                    {lead.email ?? (lead.needs_enrichment ? "Pending enrichment" : "—")}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <span style={badgeStyle(VERIFY_STATUS_COLORS[normalizeVerificationStatus(lead.email_verification_status)] ?? "#94a3b8")}>
                      {verificationLabel(lead.email_verification_status)}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <span
                      style={badgeStyle(
                        lead.processing_status === "processed"
                          ? "#22c55e"
                          : lead.processing_status === "enriching"
                            ? "#f59e0b"
                            : "#38bdf8"
                      )}
                    >
                      {(lead.processing_status ?? "new").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#cbd5e1" }}>{lead.category}</td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                    {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <span style={badgeStyle((lead.assignment_status ?? "pending") === "assigned" ? "#22c55e" : (lead.assignment_status ?? "pending") === "ready" ? "#38bdf8" : "#94a3b8")}>
                      {(lead.assignment_status ?? "pending").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <span style={badgeStyle(
                      lead.outreach_status === "sent"
                        ? "#22c55e"
                        : lead.outreach_status === "queued"
                          ? "#38bdf8"
                          : lead.outreach_status === "approved"
                            ? "#a78bfa"
                            : lead.outreach_status === "message_generated"
                              ? "#fbbf24"
                              : lead.outreach_status === "failed"
                                ? "#ef4444"
                                : "#94a3b8"
                    )}>
                      {(lead.outreach_status ?? "pending").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <span style={badgeStyle("#94a3b8")}>
                      {lead.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: (lead.reply_count ?? 0) > 0 ? "#34d399" : "#94a3b8", fontWeight: (lead.reply_count ?? 0) > 0 ? 700 : 500 }}>
                    {lead.reply_count ?? 0}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: lead.response_received ? "#34d399" : "#94a3b8" }}>
                    {lead.response_received ? "Yes" : "No"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                    {lead.last_replied_at ? new Date(lead.last_replied_at).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                    {lead.created_at ? new Date(lead.created_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VerificationProgressModal
        open={verificationJob !== null}
        title={verificationJob?.title ?? "Verifying Emails"}
        progress={verificationProgress}
        summary={verificationJob?.summary ?? null}
        onClose={() => {
          setVerificationJob(null);
          setVerificationProgress(null);
          void load();
        }}
      />
    </div>
  );
}
