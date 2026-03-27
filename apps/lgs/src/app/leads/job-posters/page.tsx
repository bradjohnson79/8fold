"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/formatters";
import { VerificationProgressModal, type VerificationProgress } from "@/components/VerificationProgressModal";

type JobPosterLead = {
  id: string;
  website: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  status: string;
  archived?: boolean;
  needs_enrichment?: boolean;
  processing_status?: string | null;
  message_status?: "none" | "ready" | "approved" | "queued" | "sent";
  workflow_status?: "pending" | "processing" | "ready" | "sent";
  contact_status?: string;
  response_received: boolean;
  reply_count?: number;
  created_at: string | null;
  last_replied_at: string | null;
  email_verification_status?: string | null;
  latest_message_id?: string | null;
  latest_message_subject?: string | null;
  latest_message_body?: string | null;
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

type VerificationQueueResponse = {
  ok?: boolean;
  data?: { queued?: number; cached?: number; alreadyQueued?: number; invalid?: number; skipped?: number };
  error?: string;
};

type BulkGenerateResponse = {
  ok?: boolean;
  success?: boolean;
  generated?: number;
  skipped?: number;
  failed?: number;
  error?: string;
};

const MSG_LABELS: Record<string, string> = {
  none: "No MSG",
  ready: "Draft MSG",
  approved: "Approved",
  queued: "Queued",
  sent: "Sent",
};

const MSG_COLORS: Record<string, string> = {
  none: "#475569",
  ready: "#2563eb",
  approved: "#16a34a",
  queued: "#f59e0b",
  sent: "#7c3aed",
};

const MSG_HINTS: Record<string, string> = {
  ready: "Message generated, awaiting approval",
  approved: "Approved, not yet sent",
  queued: "Ready for LGS sending",
};

const WORKFLOW_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  processing: "#f59e0b",
  ready: "#22c55e",
  sent: "#a78bfa",
};

const VERIFY_STATUS_COLORS: Record<string, string> = {
  pending: "#64748b",
  valid: "#22c55e",
  verified: "#22c55e",
  invalid: "#ef4444",
};

function normalizeVerificationStatus(status?: string | null): "pending" | "valid" | "invalid" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "valid" || normalized === "verified") return "valid";
  if (normalized === "invalid") return "invalid";
  return "pending";
}

function verificationLabel(status?: string | null): string {
  const normalized = normalizeVerificationStatus(status);
  if (normalized === "valid") return "Valid";
  if (normalized === "invalid") return "Invalid";
  return "Pending";
}

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

function canGenerateForLead(lead: JobPosterLead): boolean {
  if (lead.archived || lead.status === "archived") return false;
  if (!lead.email) return false;
  return normalizeVerificationStatus(lead.email_verification_status) !== "invalid";
}

function getGenerateErrorMessage(status: number): string {
  if (status === 400) return "Missing required data";
  if (status >= 500) return "Generation failed, try again";
  return "Generate failed";
}

function MsgCell({
  lead,
  onGenerated,
  onError,
}: {
  lead: JobPosterLead;
  onGenerated: (leadId: string) => void;
  onError: (message: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPinned, setTooltipPinned] = useState(false);

  const status = lead.message_status ?? "none";
  const label = MSG_LABELS[status] ?? status;
  const color = MSG_COLORS[status] ?? "#475569";
  const hint = MSG_HINTS[status];
  const previewBody = lead.latest_message_body || "No message generated";
  const generateDisabled = !canGenerateForLead(lead);

  async function handleGenerate() {
    if (!lead.email) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/lgs/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, pipeline: "jobs" }),
      });
      if (res.ok) {
        onGenerated(lead.id);
      } else {
        onError(getGenerateErrorMessage(res.status));
      }
    } catch {
      onError("Generation failed, try again");
    } finally {
      setGenerating(false);
    }
  }

  if (status === "none") {
    return (
      <button
        onClick={() => void handleGenerate()}
        disabled={generating || generateDisabled}
        title={generateDisabled ? (!lead.email ? "Email not found yet" : "Invalid email") : "Generate message"}
        style={{
          padding: "0.2rem 0.5rem",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 4,
          color: generateDisabled ? "#475569" : "#94a3b8",
          cursor: generating || generateDisabled ? "not-allowed" : "pointer",
          fontSize: "0.75rem",
          whiteSpace: "nowrap",
        }}
      >
        {generating ? "Generating…" : "Generate"}
      </button>
    );
  }

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <span
        style={{
          padding: "0.2rem 0.5rem",
          background: `${color}22`,
          border: `1px solid ${color}55`,
          borderRadius: 4,
          color,
          fontSize: "0.75rem",
          cursor: lead.latest_message_subject ? "help" : "default",
          whiteSpace: "nowrap",
          display: "inline-block",
        }}
        title={hint}
        onClick={() => setTooltipPinned((value) => !value)}
      >
        {label}
      </span>
      {(tooltipVisible || tooltipPinned) && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.4rem)",
            right: 0,
            width: 380,
            maxWidth: "min(380px, 75vw)",
            maxHeight: 320,
            overflowY: "auto",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "0.85rem",
            zIndex: 9999,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "0.5rem", fontSize: "0.82rem" }}>
            {lead.latest_message_subject ?? label}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {previewBody.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim() || "No message generated"}
          </div>
          {hint && <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "#475569" }}>{hint}</div>}
        </div>
      )}
    </span>
  );
}

export default function JobPosterLeadsPage() {
  const [leads, setLeads] = useState<JobPosterLead[]>([]);
  const [enrichment, setEnrichment] = useState<EnrichmentSummary | null>(null);
  const [search, setSearch] = useState("");
  const [filterActionability, setFilterActionability] = useState<"active" | "sendable" | "needs_attention" | "unusable">("active");
  const [filterMessageStatus, setFilterMessageStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [verifyPendingRunning, setVerifyPendingRunning] = useState(false);
  const [regenModal, setRegenModal] = useState<{ lead_ids: string[] } | null>(null);
  const [removeModal, setRemoveModal] = useState<{ lead_ids: string[]; count: number } | null>(null);
  const [verificationJob, setVerificationJob] = useState<VerificationJob | null>(null);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("filter_actionability", filterActionability);
      if (filterMessageStatus) params.set("filter_message_status", filterMessageStatus);
      const response = await lgsFetch<ApiResponse>(`/api/lgs/job-poster-leads?${params.toString()}`);
      const data = response as unknown as ApiResponse;
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
  }, [search, filterActionability, filterMessageStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!verificationJob) return;

    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams({ pipeline: verificationJob.pipeline });
      if (verificationJob.allPending) params.set("all_pending", "true");
      else if (verificationJob.leadIds.length > 0) params.set("lead_ids", verificationJob.leadIds.join(","));

      try {
        const response = await lgsFetch<VerificationProgress>(`/api/lgs/verification/status?${params.toString()}`);
        const payload = response as unknown as { ok: boolean; data?: VerificationProgress };
        if (!cancelled && payload.ok && payload.data) {
          setVerificationProgress(payload.data);
        }
      } catch {
        // Ignore transient polling failures.
      }
    };

    void run();
    const timer = setInterval(() => void run(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [verificationJob]);

  const displayedLeads = useMemo(() => leads, [leads]);
  const allSelected = displayedLeads.length > 0 && displayedLeads.every((lead) => selected.has(lead.id));
  const selectedLeads = displayedLeads.filter((lead) => selected.has(lead.id));
  const verifiableLeads = selectedLeads.filter((lead) => !!lead.email && normalizeVerificationStatus(lead.email_verification_status) !== "valid");
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedWithNoMsg = useMemo(
    () => selectedLeads.filter((lead) => (lead.message_status ?? "none") === "none" && canGenerateForLead(lead)),
    [selectedLeads],
  );
  const selectedWithReadyMsg = useMemo(
    () => selectedLeads.filter((lead) => (lead.message_status ?? "none") === "ready"),
    [selectedLeads],
  );
  const selectedWithMsg = useMemo(
    () => selectedLeads.filter((lead) => (lead.message_status ?? "none") !== "none"),
    [selectedLeads],
  );

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
      const json = (await res.json().catch(() => ({}))) as VerificationQueueResponse;
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

  async function bulkGenerate(force = false) {
    if (!force && selectedWithMsg.length > 0 && selectedWithNoMsg.length === 0) {
      setRegenModal({ lead_ids: selectedWithMsg.map((lead) => lead.id) });
      return;
    }

    const targetIds = force ? selectedIds : selectedWithNoMsg.map((lead) => lead.id);
    if (targetIds.length === 0) return;
    if (targetIds.length > 100) {
      setBulkMsg("You can generate up to 100 messages at a time");
      return;
    }

    setBulkGenerating(true);
    setBulkMsg(null);
    setRegenModal(null);
    try {
      const res = await fetch("/api/lgs/messages/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: targetIds, leadType: "job_poster", force_regenerate: force }),
      });
      const json = (await res.json().catch(() => ({}))) as BulkGenerateResponse;
      const generated = json.generated ?? 0;
      const skipped = json.skipped ?? 0;
      const failed = json.failed ?? 0;

      let msg = failed > 0 && generated === 0
        ? "Generation failed, try again"
        : `Generated ${generated} draft message${generated !== 1 ? "s" : ""}`;
      if (skipped > 0) msg += ` (${skipped} protected or existing message${skipped !== 1 ? "s" : ""} skipped)`;
      if (failed > 0) msg += ` (${failed} failed)`;
      setBulkMsg(msg);
      if (res.ok) void load();
    } catch {
      setBulkMsg("Generation failed, try again");
    } finally {
      setBulkGenerating(false);
    }
  }

  async function bulkApprove() {
    if (selectedWithReadyMsg.length === 0) return;
    setBulkApproving(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/lgs/messages/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: selectedWithReadyMsg.map((lead) => lead.id), lead_type: "job_poster" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { approved?: number } };
      const approved = json.data?.approved ?? 0;
      setBulkMsg(res.ok ? `Approved ${approved} message${approved !== 1 ? "s" : ""}` : "Approve failed");
      if (res.ok) void load();
    } finally {
      setBulkApproving(false);
    }
  }

  async function bulkRemove() {
    if (!removeModal) return;
    setBulkRemoving(true);
    try {
      const res = await fetch("/api/lgs/messages/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: removeModal.lead_ids, lead_type: "job_poster" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { messages_removed?: number } };
      setRemoveModal(null);
      setSelected(new Set());
      const removed = json.data?.messages_removed ?? 0;
      setBulkMsg(res.ok ? `Removed ${removed} message${removed !== 1 ? "s" : ""} — leads reverted to Generate` : "Remove failed");
      if (res.ok) void load();
    } finally {
      setBulkRemoving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem" }}>Job Poster Leads</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
            Job poster outreach now follows the same detail, message, and send workflow as contractor leads.
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
          <Link href="/leads/finder" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, textDecoration: "none", color: "#e2e8f0" }}>
            Open Lead Finder
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {([
          { key: "active", label: "Active", color: "#38bdf8", dimColor: "#0c4a6e33", borderColor: "#38bdf866" },
          { key: "sendable", label: "Ready to Send", color: "#22c55e", dimColor: "#16a34a33", borderColor: "#22c55e66" },
          { key: "needs_attention", label: "Processing", color: "#f59e0b", dimColor: "#f59e0b22", borderColor: "#f59e0b66" },
          { key: "unusable", label: "Not Ready", color: "#64748b", dimColor: "#1e293b", borderColor: "#334155" },
        ] as const).map(({ key, label, color, dimColor, borderColor }) => {
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
              }}
            >
              {label}
              <span style={{ fontSize: "0.75rem", background: active ? `${color}33` : "#1e293b", color: active ? color : "#475569", borderRadius: 12, padding: "0.1rem 0.45rem", fontWeight: 600 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search website, company, category, city..."
          style={{ width: "100%", maxWidth: 420, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#f8fafc", padding: "0.6rem 0.8rem" }}
        />
        <select
          value={filterMessageStatus}
          onChange={(e) => setFilterMessageStatus(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem" }}
        >
          <option value="">All MSG Status</option>
          <option value="none">No MSG</option>
          <option value="ready">Draft MSG</option>
          <option value="approved">Approved</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
        </select>
        {(search || filterMessageStatus) && (
          <button
            onClick={() => { setSearch(""); setFilterMessageStatus(""); }}
            style={{ padding: "0.5rem 0.75rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", fontSize: "0.875rem", cursor: "pointer" }}
          >
            Clear
          </button>
        )}
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
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem", padding: "0.75rem 1rem", background: "#1e293b", borderRadius: 8, border: "1px solid #334155", flexWrap: "wrap" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{selectedLeads.length} selected</span>
          {selectedWithNoMsg.length > 0 && (
            <button
              onClick={() => void bulkGenerate()}
              disabled={bulkGenerating}
              style={{ padding: "0.4rem 0.875rem", background: "#1d4ed8", border: "1px solid #3b82f666", borderRadius: 6, color: "#dbeafe", fontSize: "0.875rem", cursor: bulkGenerating ? "not-allowed" : "pointer" }}
            >
              {bulkGenerating ? "Generating…" : `Generate MSG (${selectedWithNoMsg.length})`}
            </button>
          )}
          {selectedWithReadyMsg.length > 0 && (
            <button
              onClick={() => void bulkApprove()}
              disabled={bulkApproving}
              style={{ padding: "0.4rem 0.875rem", background: "#14532d", border: "1px solid #22c55e66", borderRadius: 6, color: "#bbf7d0", fontSize: "0.875rem", cursor: bulkApproving ? "not-allowed" : "pointer" }}
            >
              {bulkApproving ? "Approving…" : `Approve MSG (${selectedWithReadyMsg.length})`}
            </button>
          )}
          {selectedWithMsg.length > 0 && (
            <button
              onClick={() => setRemoveModal({ lead_ids: selectedWithMsg.map((lead) => lead.id), count: selectedWithMsg.length })}
              disabled={bulkRemoving}
              style={{ padding: "0.4rem 0.875rem", background: "transparent", border: "1px solid #f59e0b66", borderRadius: 6, color: "#fbbf24", fontSize: "0.875rem", cursor: bulkRemoving ? "not-allowed" : "pointer" }}
            >
              Remove MSG ({selectedWithMsg.length})
            </button>
          )}
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
                {["", "Lead", "Email", "Category", "City", "Verify", "Status", "MSG", "Contact", "Last Replied", "Created"].map((label, index) => (
                  <th key={label} style={{ padding: "0.6rem 0.75rem", textAlign: "left", fontWeight: 600 }}>
                    {index === 0 ? <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} /> : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedLeads.map((lead) => {
                const workflowColor = WORKFLOW_COLORS[lead.workflow_status ?? "pending"] ?? "#94a3b8";
                const verifyColor = VERIFY_STATUS_COLORS[normalizeVerificationStatus(lead.email_verification_status)] ?? "#94a3b8";
                return (
                  <tr
                    key={lead.id}
                    style={{
                      borderBottom: "1px solid #0f172a",
                      background: lead.archived ? "#2d1a0a33" : selected.has(lead.id) ? "#1e293b44" : "transparent",
                      opacity: lead.archived ? 0.78 : 1,
                    }}
                  >
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <Link href={`/leads/job-posters/${lead.id}`} style={{ color: "#e2e8f0", textDecoration: "none", fontWeight: 500, display: "block" }}>
                        {lead.company_name ?? lead.contact_name ?? lead.website}
                      </Link>
                      <div style={{ marginTop: "0.25rem", fontSize: "0.75rem" }}>
                        <Link href={`/leads/job-posters/${lead.id}`} style={{ color: "#38bdf8", textDecoration: "none" }}>
                          {lead.website}
                        </Link>
                      </div>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#94a3b8" }}>
                      {lead.email ?? (lead.needs_enrichment ? "Pending enrichment" : "—")}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#cbd5e1" }}>{lead.category ?? "—"}</td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>{[lead.city, lead.state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <span style={badgeStyle(verifyColor)}>{verificationLabel(lead.email_verification_status)}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <span style={badgeStyle(workflowColor)}>{(lead.workflow_status ?? "pending").replace(/_/g, " ")}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <MsgCell
                        lead={lead}
                        onGenerated={() => void load()}
                        onError={(message) => setBulkMsg(message)}
                      />
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                      {lead.contact_status ? lead.contact_status.replace(/_/g, " ") : "—"}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                      {formatDateTime(lead.last_replied_at)}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                      {formatDateTime(lead.created_at)}
                    </td>
                  </tr>
                );
              })}
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

      {removeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.72)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ width: "min(92vw, 460px)", background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
            <h3 style={{ margin: "0 0 0.6rem", color: "#f8fafc" }}>Remove Messages?</h3>
            <p style={{ margin: "0 0 1rem", color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.6 }}>
              This will delete the outreach message for <strong style={{ color: "#e2e8f0" }}>{removeModal.count} lead{removeModal.count !== 1 ? "s" : ""}</strong> and allow them to be regenerated.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setRemoveModal(null)} style={{ padding: "0.5rem 0.9rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => void bulkRemove()} disabled={bulkRemoving} style={{ padding: "0.5rem 0.9rem", background: "#b45309", border: "none", borderRadius: 6, color: "#fff", cursor: bulkRemoving ? "not-allowed" : "pointer" }}>
                {bulkRemoving ? "Removing…" : `Remove ${removeModal.count} Message${removeModal.count !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {regenModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.72)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ width: "min(92vw, 500px)", background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
            <h3 style={{ margin: "0 0 0.6rem", color: "#f8fafc" }}>Regenerate Existing Messages?</h3>
            <p style={{ margin: "0 0 1rem", color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.6 }}>
              The selected leads already have messages. Regenerating will replace those existing drafts with new GPT-generated job-poster messages.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setRegenModal(null)} style={{ padding: "0.5rem 0.9rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { void bulkGenerate(true); }} disabled={bulkGenerating} style={{ padding: "0.5rem 0.9rem", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: bulkGenerating ? "not-allowed" : "pointer" }}>
                {bulkGenerating ? "Regenerating…" : "Regenerate Messages"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
