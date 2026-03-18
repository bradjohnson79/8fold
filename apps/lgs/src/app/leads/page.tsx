"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type Lead = {
  id: string;
  lead_number: number | null;
  lead_name: string | null;
  business_name: string | null;
  email: string;
  email_type: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  contact_attempts: number;
  response_received: boolean;
  signed_up: boolean;
  created_at: string;
  verification_score?: number | null;
  verification_status?: string | null;
  email_bounced?: boolean | null;
  archived: boolean;
  archived_at?: string | null;
  contact_status: string;
  message_status: string;
  latest_message_id: string | null;
  latest_message_subject: string | null;
  latest_message_body: string | null;
  // Brain fields
  lead_score?: number;
  lead_priority?: string;
  priority_source?: string;
  outreach_stage?: string;
  followup_count?: number;
  next_followup_at?: string | null;
  last_contacted_at?: string | null;
};

// ── Brain color maps ──────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#3b82f6",
  low: "#94a3b8",
  archived: "#ef4444",
};

const STAGE_COLORS: Record<string, string> = {
  not_contacted: "#475569",
  message_ready: "#a78bfa",
  queued: "#eab308",
  sent: "#3b82f6",
  replied: "#22c55e",
  converted: "#8b5cf6",
  paused: "#ef4444",
  archived: "#475569",
};

function PriorityBadge({ priority, isManual }: { priority: string; isManual?: boolean }) {
  const color = PRIORITY_COLORS[priority] ?? "#64748b";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {isManual && <span title="Manually set">🔒</span>}
      {priority}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage] ?? "#475569";
  const label = stage.replace(/_/g, " ");
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 500,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

type EnrichmentSummary = {
  pending: number;
  verified: number;
  archived: number;
  total: number;
};

type ApiResponse = {
  ok: boolean;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  enrichment?: EnrichmentSummary;
  data: Lead[];
  error?: string;
};

const MSG_LABELS: Record<string, string> = {
  none: "No MSG",
  ready: "MSG Ready",
  approved: "Approved",
  sent: "Sent",
};

const MSG_COLORS: Record<string, string> = {
  none: "#475569",
  ready: "#2563eb",
  approved: "#16a34a",
  sent: "#7c3aed",
};

const CONTACT_LABELS: Record<string, string> = {
  unsent: "—",
  sent: "Sent",
  replied: "Replied",
  converted: "Converted",
};

function verifyColor(score: number | null | undefined): string {
  if (score == null) return "#475569";
  if (score >= 95) return "#16a34a"; // green
  if (score >= 85) return "#3b82f6"; // blue
  if (score >= 70) return "#f59e0b"; // orange
  return "#ef4444";                  // red
}

function MsgCell({ lead, onGenerated }: { lead: Lead; onGenerated: (leadId: string) => void }) {
  const [generating, setGenerating] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const status = lead.message_status;
  const label = MSG_LABELS[status] ?? status;
  const color = MSG_COLORS[status] ?? "#475569";

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/lgs/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      if (res.ok) onGenerated(lead.id);
    } finally {
      setGenerating(false);
    }
  }, [lead.id, onGenerated]);

  if (status === "none") {
    return (
      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{
          padding: "0.2rem 0.5rem",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 4,
          color: "#94a3b8",
          cursor: generating ? "not-allowed" : "pointer",
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
      >
        {label}
      </span>
      {tooltipVisible && lead.latest_message_subject && (
        <div
          style={{
            position: "fixed",
            width: 340,
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "0.85rem",
            zIndex: 9999,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            pointerEvents: "none",
            transform: "translateY(-110%)",
          }}
        >
          <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "0.5rem", fontSize: "0.82rem" }}>
            {lead.latest_message_subject}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {(lead.latest_message_body ?? "").slice(0, 350)}
            {(lead.latest_message_body?.length ?? 0) > 350 ? "…" : ""}
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "#475569" }}>
            Click lead name to view full message
          </div>
        </div>
      )}
    </span>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterContactStatus, setFilterContactStatus] = useState("");
  const [filterMessageStatus, setFilterMessageStatus] = useState("");
  const [filterArchived, setFilterArchived] = useState("active"); // active | archived | all
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterNeedsFollowup, setFilterNeedsFollowup] = useState(false);
  const [scoreSort, setScoreSort] = useState<"asc" | "desc" | "">("");
  const [followupSort, setFollowupSort] = useState<"asc" | "desc" | "">("");
  const [bulkPriorityPending, setBulkPriorityPending] = useState<string | null>(null);
  const [bulkPausePending, setBulkPausePending] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // Deduplicate state
  const [dedupeModal, setDedupeModal] = useState<{
    open: boolean;
    duplicates_found: number;
    records_to_remove: number;
    records_to_keep: number;
    lead_ids: string[];
  } | null>(null);
  const [dedupeRunning, setDedupeRunning] = useState(false);

  // Remove MSG modal state
  const [removeModal, setRemoveModal] = useState<{ lead_ids: string[]; count: number } | null>(null);

  // Regeneration guard: leads with existing messages that user is trying to regenerate
  const [regenModal, setRegenModal] = useState<{ lead_ids: string[] } | null>(null);

  // Archive / restore state
  const [archiveModal, setArchiveModal] = useState<{ lead_ids: string[]; count: number } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [archiveQualityModal, setArchiveQualityModal] = useState(false);
  const [archiveQualityRunning, setArchiveQualityRunning] = useState(false);

  const [enrichment, setEnrichment] = useState<EnrichmentSummary | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterContactStatus) params.set("filter_contact_status", filterContactStatus);
      if (filterMessageStatus) params.set("filter_message_status", filterMessageStatus);
      params.set("filter_archived", filterArchived);

      const r = await lgsFetch<ApiResponse>(`/api/lgs/leads?${params.toString()}`);
      const res = r as unknown as ApiResponse;
      if (res.ok) {
        setLeads(res.data ?? []);
        setTotal(res.total ?? 0);
        setTotalPages(res.total_pages ?? 1);
        if (res.enrichment) setEnrichment(res.enrichment);
      } else {
        setErr((r as { error?: string }).error ?? "Failed to load");
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, filterContactStatus, filterMessageStatus, filterArchived]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterContactStatus, filterMessageStatus, filterArchived]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); leads.forEach((l) => n.delete(l.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); leads.forEach((l) => n.add(l.id)); return n; });
    }
  }

  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedLeads = useMemo(() => leads.filter((l) => selected.has(l.id)), [leads, selected]);
  const selectedWithNoMsg = useMemo(() => selectedLeads.filter((l) => l.message_status === "none"), [selectedLeads]);
  const selectedWithReadyMsg = useMemo(() => selectedLeads.filter((l) => l.message_status === "ready"), [selectedLeads]);
  // Any lead with an existing message (ready, approved, or sent) — shown in Remove MSG
  const selectedWithMsg = useMemo(() => selectedLeads.filter((l) => l.message_status !== "none"), [selectedLeads]);

  async function bulkGenerate(force = false) {
    // If any selected leads already have messages and we're not force-regenerating, show guard
    if (!force && selectedWithMsg.length > 0 && selectedWithNoMsg.length === 0) {
      setRegenModal({ lead_ids: selectedWithMsg.map((l) => l.id) });
      return;
    }
    // If a mix: warn if any have messages, otherwise generate only the no-msg ones
    const targetIds = force
      ? selectedIds
      : selectedWithNoMsg.map((l) => l.id);
    if (targetIds.length === 0) return;

    setBulkGenerating(true);
    setBulkMsg(null);
    setRegenModal(null);
    try {
      const res = await fetch("/api/lgs/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: targetIds, force_regenerate: force }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { generated?: number; skipped?: number } };
      const generated = json.data?.generated ?? 0;
      const skipped = json.data?.skipped ?? 0;
      let msg = res.ok ? `Generated ${generated} message${generated !== 1 ? "s" : ""}` : "Generate failed";
      if (res.ok && skipped > 0) msg += ` (${skipped} already had messages — skipped)`;
      setBulkMsg(msg);
      if (res.ok) void fetchLeads();
    } finally {
      setBulkGenerating(false);
    }
  }

  async function bulkRemove() {
    if (!removeModal) return;
    setBulkRemoving(true);
    try {
      const res = await fetch("/api/lgs/messages/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: removeModal.lead_ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { messages_removed?: number } };
      setRemoveModal(null);
      setSelected(new Set());
      const removed = json.data?.messages_removed ?? 0;
      setBulkMsg(res.ok ? `Removed ${removed} message${removed !== 1 ? "s" : ""} — leads reverted to Generate` : "Remove failed");
      if (res.ok) void fetchLeads();
    } finally {
      setBulkRemoving(false);
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
        body: JSON.stringify({ lead_ids: selectedWithReadyMsg.map((l) => l.id) }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { approved?: number } };
      const approved = json.data?.approved ?? 0;
      setBulkMsg(res.ok ? `Approved ${approved} message${approved !== 1 ? "s" : ""}` : "Approve failed");
      if (res.ok) void fetchLeads();
    } finally {
      setBulkApproving(false);
    }
  }

  async function openDedupeModal(leadIds: string[]) {
    setBulkMsg(null);
    try {
      const res = await fetch("/api/lgs/leads/deduplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: leadIds, preview: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { duplicates_found: number; records_to_remove: number; records_to_keep: number };
      };
      if (res.ok && json.data) {
        setDedupeModal({
          open: true,
          duplicates_found: json.data.duplicates_found,
          records_to_remove: json.data.records_to_remove,
          records_to_keep: json.data.records_to_keep,
          lead_ids: leadIds,
        });
      } else {
        setBulkMsg("Failed to preview deduplication");
      }
    } catch {
      setBulkMsg("Failed to preview deduplication");
    }
  }

  async function runDedupe() {
    if (!dedupeModal) return;
    setDedupeRunning(true);
    try {
      const res = await fetch("/api/lgs/leads/deduplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_ids: dedupeModal.lead_ids.length > 0 ? dedupeModal.lead_ids : [],
          preview: false,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { records_removed: number; records_remaining: number };
      };
      setDedupeModal(null);
      setSelected(new Set());
      if (res.ok && json.data) {
        const removed = json.data.records_removed;
        setBulkMsg(
          removed > 0
            ? `Deduplication complete. ${removed} duplicate lead${removed !== 1 ? "s" : ""} removed.`
            : "No duplicates found — database is already clean."
        );
        void fetchLeads();
      } else {
        setBulkMsg("Deduplication failed");
      }
    } finally {
      setDedupeRunning(false);
    }
  }

  async function bulkArchive() {
    if (!archiveModal) return;
    setArchiving(true);
    try {
      const res = await fetch("/api/lgs/leads/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: archiveModal.lead_ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { archived?: number } };
      setArchiveModal(null);
      setSelected(new Set());
      const archived = json.data?.archived ?? 0;
      setBulkMsg(res.ok ? `Archived ${archived} lead${archived !== 1 ? "s" : ""}` : "Archive failed");
      if (res.ok) void fetchLeads();
    } finally {
      setArchiving(false);
    }
  }

  async function bulkRestore() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    setRestoring(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/lgs/leads/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { restored?: number } };
      setSelected(new Set());
      const restored = json.data?.restored ?? 0;
      setBulkMsg(res.ok ? `Restored ${restored} lead${restored !== 1 ? "s" : ""}` : "Restore failed");
      if (res.ok) void fetchLeads();
    } finally {
      setRestoring(false);
    }
  }

  async function runArchiveQuality() {
    setArchiveQualityRunning(true);
    setArchiveQualityModal(false);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/lgs/leads/archive-quality", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { archived?: number } };
      const archived = json.data?.archived ?? 0;
      setBulkMsg(res.ok ? `Archived ${archived} low-quality lead${archived !== 1 ? "s" : ""} (score < 85)` : "Archive quality failed");
      if (res.ok) void fetchLeads();
    } finally {
      setArchiveQualityRunning(false);
    }
  }

  async function bulkSetPriority(priority: string) {
    if (selectedIds.length === 0) return;
    setBulkPriorityPending(priority);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/lgs/leads/set-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: selectedIds, priority }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { updated?: number } };
      const updated = json.data?.updated ?? 0;
      setBulkMsg(res.ok ? `Set ${updated} lead${updated !== 1 ? "s" : ""} to ${priority} priority` : "Priority update failed");
      if (res.ok) void fetchLeads();
    } finally {
      setBulkPriorityPending(null);
    }
  }

  async function bulkPause() {
    if (selectedIds.length === 0) return;
    setBulkPausePending(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/lgs/leads/set-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: selectedIds, stage: "paused" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { updated?: number } };
      const updated = json.data?.updated ?? 0;
      setBulkMsg(res.ok ? `Paused ${updated} lead${updated !== 1 ? "s" : ""}` : "Pause failed");
      if (res.ok) void fetchLeads();
    } finally {
      setBulkPausePending(false);
    }
  }

  // Client-side sort + filter for brain fields (server doesn't support these yet)
  const displayedLeads = useMemo(() => {
    let list = leads;
    if (filterPriority) list = list.filter((l) => l.lead_priority === filterPriority);
    if (filterStage) list = list.filter((l) => l.outreach_stage === filterStage);
    if (filterNeedsFollowup) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      list = list.filter(
        (l) => l.next_followup_at && new Date(l.next_followup_at) <= today && l.outreach_stage === "sent"
      );
    }
    if (scoreSort) {
      list = [...list].sort((a, b) =>
        scoreSort === "desc"
          ? (b.lead_score ?? 0) - (a.lead_score ?? 0)
          : (a.lead_score ?? 0) - (b.lead_score ?? 0)
      );
    } else if (followupSort) {
      list = [...list].sort((a, b) => {
        const ta = a.next_followup_at ? new Date(a.next_followup_at).getTime() : Infinity;
        const tb = b.next_followup_at ? new Date(b.next_followup_at).getTime() : Infinity;
        return followupSort === "asc" ? ta - tb : tb - ta;
      });
    }
    return list;
  }, [leads, filterPriority, filterStage, filterNeedsFollowup, scoreSort, followupSort]);

  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>
          Contractor Leads <HelpTooltip text={helpText.leads} />
        </h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setArchiveQualityModal(true)}
            disabled={archiveQualityRunning}
            style={{ padding: "0.6rem 1rem", background: "transparent", border: "1px solid #f59e0b66", borderRadius: 8, fontSize: "0.875rem", color: "#f59e0b", cursor: archiveQualityRunning ? "not-allowed" : "pointer", fontWeight: 500 }}
          >
            {archiveQualityRunning ? "Archiving…" : "Archive Low-Quality"}
          </button>
          <button
            onClick={() => void openDedupeModal([])}
            style={{ padding: "0.6rem 1rem", background: "transparent", border: "1px solid #7c3aed66", borderRadius: 8, fontSize: "0.875rem", color: "#a78bfa", cursor: "pointer", fontWeight: 500 }}
          >
            Deduplicate All
          </button>
          <Link href="/leads/import" style={{ padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8, fontSize: "0.875rem", border: "1px solid #334155" }}>
            + Import Contractor Websites
          </Link>
        </div>
      </div>

      {/* Enrichment status bar */}
      {enrichment && (enrichment.pending > 0 || enrichment.verified > 0) && (
        <div style={{
          display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap",
          padding: "0.6rem 1rem", background: "#1e293b", borderRadius: 8,
          marginBottom: "1rem", fontSize: "0.82rem", border: "1px solid #334155",
        }}>
          <span style={{ color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.72rem" }}>
            Email Verification
          </span>
          <span style={{ color: "#4ade80" }}>
            <strong>{enrichment.verified}</strong> verified
          </span>
          {enrichment.pending > 0 && (
            <span style={{ color: "#fbbf24" }}>
              <strong>{enrichment.pending}</strong> pending
            </span>
          )}
          <span style={{ color: "#94a3b8" }}>
            <strong>{enrichment.archived}</strong> archived
          </span>
          <span style={{ color: "#475569" }}>
            {enrichment.total} total
          </span>
          {enrichment.pending > 0 && enrichment.total > 0 && (
            <div style={{ flex: 1, minWidth: 100, height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: `${Math.round((enrichment.verified / enrichment.total) * 100)}%`,
                background: "linear-gradient(90deg, #22c55e, #4ade80)",
                transition: "width 0.4s ease",
              }} />
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search name, email, business, city, state…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem", width: 240 }}
        />
        <select
          value={filterArchived}
          onChange={(e) => setFilterArchived(e.target.value)}
          style={{
            padding: "0.5rem 0.75rem", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem",
            background: filterArchived === "archived" ? "#2d1a0a" : "#1e293b",
            border: filterArchived === "archived" ? "1px solid #f59e0b88" : "1px solid #334155",
          }}
        >
          <option value="active">Active Leads</option>
          <option value="archived">Archived Leads</option>
          <option value="all">All Leads</option>
        </select>
        <select
          value={filterContactStatus}
          onChange={(e) => setFilterContactStatus(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem" }}
        >
          <option value="">All Contact Status</option>
          <option value="unsent">Unsent</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
          <option value="converted">Converted</option>
        </select>
        <select
          value={filterMessageStatus}
          onChange={(e) => setFilterMessageStatus(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem" }}
        >
          <option value="">All MSG Status</option>
          <option value="none">No MSG</option>
          <option value="ready">MSG Ready</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", background: filterPriority ? "#1e293b" : "#1e293b", border: filterPriority ? "1px solid #22c55e55" : "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem" }}
        >
          <option value="">All Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", background: "#1e293b", border: filterStage ? "1px solid #3b82f655" : "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: "0.875rem" }}
        >
          <option value="">All Stage</option>
          <option value="not_contacted">Not Contacted</option>
          <option value="message_ready">Message Ready</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
          <option value="converted">Converted</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
        <button
          onClick={() => setFilterNeedsFollowup((v) => !v)}
          style={{
            padding: "0.5rem 0.75rem",
            background: filterNeedsFollowup ? "#f59e0b22" : "transparent",
            border: filterNeedsFollowup ? "1px solid #f59e0b88" : "1px solid #334155",
            borderRadius: 6,
            color: filterNeedsFollowup ? "#f59e0b" : "#94a3b8",
            fontSize: "0.875rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Follow-up Due Today
        </button>
        {(search || filterContactStatus || filterMessageStatus || filterArchived !== "active" || filterPriority || filterStage || filterNeedsFollowup) && (
          <button
            onClick={() => { setSearch(""); setFilterContactStatus(""); setFilterMessageStatus(""); setFilterArchived("active"); setFilterPriority(""); setFilterStage(""); setFilterNeedsFollowup(false); }}
            style={{ padding: "0.5rem 0.75rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", fontSize: "0.875rem", cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem", padding: "0.75rem 1rem", background: "#1e293b", borderRadius: 8, border: "1px solid #334155" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{selectedIds.length} selected</span>
          {selectedWithNoMsg.length > 0 && (
            <button
              onClick={bulkGenerate}
              disabled={bulkGenerating}
              style={{ padding: "0.4rem 0.875rem", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", fontSize: "0.875rem", cursor: bulkGenerating ? "not-allowed" : "pointer" }}
            >
              {bulkGenerating ? "Generating…" : `Generate MSG (${selectedWithNoMsg.length})`}
            </button>
          )}
          {selectedWithReadyMsg.length > 0 && (
            <button
              onClick={bulkApprove}
              disabled={bulkApproving}
              style={{ padding: "0.4rem 0.875rem", background: "#16a34a", border: "none", borderRadius: 6, color: "#fff", fontSize: "0.875rem", cursor: bulkApproving ? "not-allowed" : "pointer" }}
            >
              {bulkApproving ? "Approving…" : `Approve MSG (${selectedWithReadyMsg.length})`}
            </button>
          )}
          {selectedWithMsg.length > 0 && (
            <button
              onClick={() => setRemoveModal({ lead_ids: selectedWithMsg.map((l) => l.id), count: selectedWithMsg.length })}
              disabled={bulkRemoving}
              style={{ padding: "0.4rem 0.875rem", background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 6, color: "#f87171", fontSize: "0.875rem", cursor: bulkRemoving ? "not-allowed" : "pointer", fontWeight: 500 }}
            >
              Remove MSG ({selectedWithMsg.length})
            </button>
          )}
          {filterArchived !== "archived" && (
            <button
              onClick={() => setArchiveModal({ lead_ids: selectedIds, count: selectedIds.length })}
              disabled={archiving}
              style={{ padding: "0.4rem 0.875rem", background: "#2d1a0a22", border: "1px solid #f59e0b66", borderRadius: 6, color: "#f59e0b", fontSize: "0.875rem", cursor: archiving ? "not-allowed" : "pointer", fontWeight: 500 }}
            >
              Archive ({selectedIds.length})
            </button>
          )}
          {filterArchived === "archived" && (
            <button
              onClick={() => void bulkRestore()}
              disabled={restoring}
              style={{ padding: "0.4rem 0.875rem", background: "#1e3a2f22", border: "1px solid #22c55e66", borderRadius: 6, color: "#4ade80", fontSize: "0.875rem", cursor: restoring ? "not-allowed" : "pointer", fontWeight: 500 }}
            >
              {restoring ? "Restoring…" : `Restore (${selectedIds.length})`}
            </button>
          )}
          {filterArchived !== "archived" && (
            <button
              onClick={() => void openDedupeModal(selectedIds)}
              style={{ padding: "0.4rem 0.875rem", background: "#7c3aed22", border: "1px solid #7c3aed66", borderRadius: 6, color: "#a78bfa", fontSize: "0.875rem", cursor: "pointer", fontWeight: 500 }}
            >
              Deduplicate Run
            </button>
          )}
          {/* Brain: Set Priority */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Priority:</span>
            {["high", "medium", "low"].map((p) => (
              <button
                key={p}
                onClick={() => void bulkSetPriority(p)}
                disabled={!!bulkPriorityPending}
                style={{
                  padding: "0.3rem 0.6rem",
                  background: bulkPriorityPending === p ? "#22c55e22" : "#1e293b",
                  border: `1px solid ${p === "high" ? "#22c55e" : p === "medium" ? "#3b82f6" : "#94a3b8"}44`,
                  borderRadius: 5,
                  color: p === "high" ? "#22c55e" : p === "medium" ? "#3b82f6" : "#94a3b8",
                  cursor: bulkPriorityPending ? "not-allowed" : "pointer",
                  fontSize: "0.75rem",
                  textTransform: "capitalize",
                }}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Brain: Pause */}
          <button
            onClick={() => void bulkPause()}
            disabled={bulkPausePending}
            style={{ padding: "0.4rem 0.875rem", background: "#ef444422", border: "1px solid #ef444466", borderRadius: 6, color: "#f87171", fontSize: "0.875rem", cursor: bulkPausePending ? "not-allowed" : "pointer", fontWeight: 500 }}
          >
            {bulkPausePending ? "Pausing…" : `Pause (${selectedIds.length})`}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ padding: "0.4rem 0.75rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", fontSize: "0.875rem", cursor: "pointer" }}
          >
            Deselect
          </button>
          {bulkMsg && (
            <span style={{ color: bulkMsg.toLowerCase().includes("fail") ? "#f87171" : "#4ade80", fontSize: "0.875rem" }}>
              {bulkMsg}
            </span>
          )}
        </div>
      )}

      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}

      {/* Pagination info */}
      {total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            {loading ? "Loading…" : `Showing ${startIdx}–${endIdx} of ${total} leads`}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: "0.35rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: page <= 1 ? "#475569" : "#e2e8f0", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
            >
              ← Prev
            </button>
            <span style={{ padding: "0.35rem 0.5rem", color: "#94a3b8", fontSize: "0.875rem" }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ padding: "0.35rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: page >= totalPages ? "#475569" : "#e2e8f0", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {!loading && leads.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>
          {total === 0 && !search && !filterContactStatus && !filterMessageStatus
            ? "No leads yet. Import leads from CSV or Excel."
            : "No leads match your filters."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#94a3b8" }}>
                <th style={{ padding: "0.6rem 0.5rem" }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} />
                </th>
                <th style={{ padding: "0.6rem 0.5rem" }}>#</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Business</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Email</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Trade</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>City</th>
                <th style={{ padding: "0.6rem 0.5rem" }}>St</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Verify</th>
                <th
                  style={{ padding: "0.6rem 0.5rem", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  onClick={() => setScoreSort((s) => (s === "desc" ? "asc" : "desc"))}
                >
                  Score {scoreSort === "desc" ? "↓" : scoreSort === "asc" ? "↑" : "↕"}
                </th>
                <th style={{ padding: "0.6rem 0.5rem" }}>Priority</th>
                <th style={{ padding: "0.6rem 0.5rem" }}>Stage</th>
                <th style={{ padding: "0.6rem 0.5rem" }}>F/U</th>
                <th
                  style={{ padding: "0.6rem 0.5rem", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  onClick={() => setFollowupSort((s) => (s === "asc" ? "desc" : "asc"))}
                >
                  Next F/U {followupSort === "asc" ? "↑" : followupSort === "desc" ? "↓" : "↕"}
                </th>
                <th style={{ padding: "0.6rem 0.75rem" }}>MSG</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Contact</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Signup</th>
              </tr>
            </thead>
            <tbody>
              {displayedLeads.map((l) => {
                const needsFollowup =
                  l.outreach_stage === "sent" &&
                  l.next_followup_at &&
                  new Date(l.next_followup_at) <= new Date();
                return (
                <tr
                  key={l.id}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    background: l.archived
                      ? selected.has(l.id) ? "#2d1a0a66" : "#2d1a0a33"
                      : selected.has(l.id) ? "#1e293b44" : "transparent",
                    opacity: l.archived ? 0.75 : 1,
                  }}
                >
                  <td style={{ padding: "0.6rem 0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", color: "#64748b", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {l.lead_number != null ? `#${String(l.lead_number).padStart(4, "0")}` : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <Link href={`/leads/${l.id}`} style={{ color: "#e2e8f0", textDecoration: "none", fontWeight: 500 }}>
                      {l.business_name ?? l.lead_name ?? "—"}
                    </Link>
                    {l.archived && (
                      <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", background: "#2d1a0a", border: "1px solid #f59e0b66", color: "#f59e0b", borderRadius: 3, padding: "0.1rem 0.35rem", fontWeight: 600, verticalAlign: "middle" }}>
                        Archived
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#94a3b8" }}>{l.email}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{l.trade ?? "—"}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{l.city ?? "—"}</td>
                  <td style={{ padding: "0.6rem 0.5rem", color: "#94a3b8" }}>{l.state ?? "—"}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    {l.verification_status === "pending" || (l.verification_score === 0 && l.verification_status === "pending") ? (
                      <span style={{ color: "#fbbf24", fontSize: "0.78rem", fontStyle: "italic" }}>Pending</span>
                    ) : l.verification_score != null && l.verification_score > 0 ? (
                      <span style={{ color: verifyColor(l.verification_score), fontWeight: l.verification_score >= 85 ? 700 : 400 }}>
                        {l.verification_score}
                      </span>
                    ) : "—"}
                  </td>
                  {/* Brain columns */}
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                    {l.lead_score != null ? (
                      <span style={{
                        color: (l.lead_score ?? 0) >= 80 ? "#22c55e" : (l.lead_score ?? 0) >= 55 ? "#3b82f6" : "#94a3b8",
                        fontWeight: 600,
                        fontSize: 12,
                      }}>
                        {l.lead_score}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem" }}>
                    {l.lead_priority ? (
                      <PriorityBadge priority={l.lead_priority} isManual={l.priority_source === "manual"} />
                    ) : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem" }}>
                    {l.outreach_stage ? <StageBadge stage={l.outreach_stage} /> : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
                    {l.followup_count ?? 0}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap", fontSize: 11 }}>
                    {l.next_followup_at ? (
                      <span style={{ color: needsFollowup ? "#f59e0b" : "#64748b" }}>
                        {new Date(l.next_followup_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {needsFollowup && " ⚡"}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <MsgCell lead={l} onGenerated={() => void fetchLeads()} />
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#94a3b8" }}>
                    {CONTACT_LABELS[l.contact_status] ?? l.contact_status}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    {l.signed_up ? <span style={{ color: "#16a34a" }}>✓</span> : "—"}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: "0.35rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: page <= 1 ? "#475569" : "#e2e8f0", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
          >
            ← Prev
          </button>
          <span style={{ padding: "0.35rem 0.5rem", color: "#94a3b8", fontSize: "0.875rem" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ padding: "0.35rem 0.75rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: page >= totalPages ? "#475569" : "#e2e8f0", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Archive confirmation modal ────────────────────────────────── */}
      {archiveModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget && !archiving) setArchiveModal(null); }}
        >
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "2rem", width: 440, maxWidth: "90vw" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>
              Archive {archiveModal.count} Lead{archiveModal.count !== 1 ? "s" : ""}?
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              Leads with low verification scores should not be used for outreach.
              Archived leads will be <strong style={{ color: "#e2e8f0" }}>removed from the active contractor list</strong> but kept in the database for analytics and future reprocessing.
              <br /><br />
              You can restore them at any time using the <strong style={{ color: "#e2e8f0" }}>Archived Leads</strong> view.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => void bulkArchive()}
                disabled={archiving}
                style={{ flex: 1, padding: "0.65rem 1rem", background: archiving ? "#1e293b" : "#92400e", border: "1px solid #f59e0b66", borderRadius: 8, color: archiving ? "#475569" : "#fde68a", fontWeight: 700, cursor: archiving ? "not-allowed" : "pointer", fontSize: "0.9rem" }}
              >
                {archiving ? "Archiving…" : `Archive ${archiveModal.count} Lead${archiveModal.count !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => setArchiveModal(null)}
                disabled={archiving}
                style={{ padding: "0.65rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#94a3b8", cursor: archiving ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Low-Quality confirmation modal ─────────────────────── */}
      {archiveQualityModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setArchiveQualityModal(false); }}
        >
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "2rem", width: 440, maxWidth: "90vw" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>Archive All Low-Quality Leads?</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              This will archive every active lead with a verification score <strong style={{ color: "#f59e0b" }}>below 85</strong>.
              These leads remain in the database and can be restored at any time.
              <br /><br />
              Use this to ensure your active outreach pipeline only contains high-quality contacts.
            </p>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.5rem", fontSize: "0.82rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <span style={{ color: "#16a34a" }}>● 95–100 = Active (Green)</span>
                <span style={{ color: "#3b82f6" }}>● 85–94 = Active (Blue)</span>
              </div>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                <span style={{ color: "#f59e0b" }}>● 70–84 = Archived (Orange)</span>
                <span style={{ color: "#ef4444" }}>● &lt;70 = Archived (Red)</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => void runArchiveQuality()}
                style={{ flex: 1, padding: "0.65rem 1rem", background: "#92400e", border: "1px solid #f59e0b66", borderRadius: 8, color: "#fde68a", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}
              >
                Archive Low-Quality Leads
              </button>
              <button
                onClick={() => setArchiveQualityModal(false)}
                style={{ padding: "0.65rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#94a3b8", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove MSG confirmation modal ─────────────────────────────── */}
      {removeModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget && !bulkRemoving) setRemoveModal(null); }}
        >
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "2rem", width: 420, maxWidth: "90vw" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>Remove Outreach Messages</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              This will delete the outreach message for <strong style={{ color: "#e2e8f0" }}>{removeModal.count} lead{removeModal.count !== 1 ? "s" : ""}</strong> and allow them to be regenerated.
              <br /><br />
              The lead will revert to <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>Generate</span> status.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => void bulkRemove()}
                disabled={bulkRemoving}
                style={{ flex: 1, padding: "0.65rem 1rem", background: bulkRemoving ? "#1e293b" : "#b91c1c", border: "none", borderRadius: 8, color: bulkRemoving ? "#475569" : "#fff", fontWeight: 700, cursor: bulkRemoving ? "not-allowed" : "pointer", fontSize: "0.9rem" }}
              >
                {bulkRemoving ? "Removing…" : `Remove ${removeModal.count} Message${removeModal.count !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => setRemoveModal(null)}
                disabled={bulkRemoving}
                style={{ padding: "0.65rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#94a3b8", cursor: bulkRemoving ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Regeneration guard modal ──────────────────────────────────── */}
      {regenModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setRegenModal(null); }}
        >
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "2rem", width: 420, maxWidth: "90vw" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>Messages Already Exist</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              <strong style={{ color: "#e2e8f0" }}>{regenModal.lead_ids.length} selected lead{regenModal.lead_ids.length !== 1 ? "s" : ""}</strong> already have outreach messages.
              <br /><br />
              You can remove the existing messages first, or force-regenerate to overwrite them.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                onClick={() => { void bulkGenerate(true); }}
                style={{ padding: "0.65rem 1rem", background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}
              >
                Remove & Regenerate
              </button>
              <button
                onClick={() => setRegenModal(null)}
                style={{ padding: "0.65rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#94a3b8", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduplicate confirmation modal */}
      {dedupeModal?.open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !dedupeRunning) setDedupeModal(null); }}
        >
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "2rem", width: 420, maxWidth: "90vw" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>Deduplicate Leads</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              Duplicate leads with the same email will be merged, keeping the best record for each address.
              {dedupeModal.lead_ids.length > 0
                ? ` Scope: ${dedupeModal.lead_ids.length} selected lead${dedupeModal.lead_ids.length !== 1 ? "s" : ""}.`
                : " Scope: entire lead database."}
            </p>

            <div style={{ background: "#0f172a", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Duplicate email groups</span>
                <span style={{ fontWeight: 700, color: "#f8fafc", fontVariantNumeric: "tabular-nums" }}>{dedupeModal.duplicates_found}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Records to remove</span>
                <span style={{ fontWeight: 700, color: "#f87171", fontVariantNumeric: "tabular-nums" }}>{dedupeModal.records_to_remove}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Records to keep</span>
                <span style={{ fontWeight: 700, color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>{dedupeModal.records_to_keep}</span>
              </div>
            </div>

            {dedupeModal.records_to_remove === 0 ? (
              <div>
                <p style={{ color: "#4ade80", fontSize: "0.875rem", marginBottom: "1rem" }}>
                  No duplicates found — this selection is already clean.
                </p>
                <button
                  onClick={() => setDedupeModal(null)}
                  style={{ padding: "0.6rem 1.25rem", background: "#334155", border: "none", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={() => void runDedupe()}
                  disabled={dedupeRunning}
                  style={{
                    flex: 1, padding: "0.65rem 1rem",
                    background: dedupeRunning ? "#1e293b" : "#7c3aed",
                    border: "none", borderRadius: 8,
                    color: dedupeRunning ? "#475569" : "#fff",
                    fontWeight: 700,
                    cursor: dedupeRunning ? "not-allowed" : "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {dedupeRunning
                    ? "Deduplicating…"
                    : `Remove ${dedupeModal.records_to_remove} Duplicate${dedupeModal.records_to_remove !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => setDedupeModal(null)}
                  disabled={dedupeRunning}
                  style={{ padding: "0.65rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 8, color: "#94a3b8", cursor: dedupeRunning ? "not-allowed" : "pointer" }}
                >
                  Cancel
                </button>
              </div>
            )}

            <div style={{ marginTop: "1rem", fontSize: "0.72rem", color: "#475569", lineHeight: 1.7 }}>
              Keep priority: Converted → Replied → Sent → Approved MSG → Highest verify score → Earliest lead #
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
