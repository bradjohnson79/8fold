"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/formatters";

type Message = {
  id: string;
  subject: string | null;
  body: string | null;
  status: "none" | "ready" | "approved" | "queued" | "sent" | null;
  created_at: string | null;
  reviewed_at: string | null;
};

type Lead = {
  id: string;
  website: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string | null;
  status: string | null;
  processing_status: string | null;
  assignment_status: string | null;
  outreach_status: string | null;
  contact_status: string;
  contact_attempts: number;
  response_received: boolean;
  signed_up: boolean;
  verification_status: string | null;
  email_bounced: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  latest_message: Message | null;
};

const MSG_STATUS_LABEL: Record<string, string> = {
  ready: "Draft MSG",
  approved: "Approved",
  queued: "Queued",
  sent: "Sent",
};

const MSG_STATUS_COLOR: Record<string, string> = {
  ready: "#2563eb",
  approved: "#16a34a",
  queued: "#f59e0b",
  sent: "#7c3aed",
};

function canGenerateForLead(lead: Lead | null): boolean {
  if (!lead?.email) return false;
  if (lead.status === "archived") return false;
  return lead.verification_status !== "invalid";
}

function getGenerateErrorMessage(status: number): string {
  if (status === 400) return "Missing required data";
  if (status >= 500) return "Generation failed, try again";
  return "Generate failed";
}

async function fetchLead(leadId: string): Promise<Lead | null> {
  const response = await lgsFetch<Lead>(`/api/lgs/job-poster-leads/${leadId}`);
  const raw = response as unknown as { ok: boolean; data: Lead };
  return raw.ok ? raw.data : null;
}

function Field({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ color: value ? "#e2e8f0" : "#334155", fontFamily: mono ? "monospace" : undefined, fontSize: mono ? "0.82rem" : "0.9rem" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

type EditableFieldProps = {
  label: string;
  value: string | null | undefined;
  fieldKey: string;
  onSave: (key: string, value: string) => Promise<void>;
};

function EditableField({ label, value, fieldKey, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(fieldKey, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      {editing ? (
        <div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") cancel(); }}
            style={{
              width: "100%",
              background: "#0f172a",
              border: "1px solid #3b82f6",
              borderRadius: 5,
              padding: "0.35rem 0.6rem",
              color: "#f8fafc",
              fontSize: "0.9rem",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: "0.4rem",
            }}
          />
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              onClick={() => void save()}
              disabled={saving}
              style={{ padding: "0.2rem 0.6rem", background: "#2563eb", border: "none", borderRadius: 4, color: "#fff", fontSize: "0.75rem", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600 }}
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              onClick={cancel}
              style={{ padding: "0.2rem 0.6rem", background: "transparent", border: "1px solid #475569", borderRadius: 4, color: "#94a3b8", fontSize: "0.75rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minHeight: "1.4rem" }}>
          <span style={{ color: value ? "#e2e8f0" : "#334155", fontSize: "0.9rem" }}>
            {value ?? "—"}
          </span>
          <button
            onClick={() => { setDraft(value ?? ""); setEditing(true); }}
            title="Edit"
            style={{ padding: "0 0.3rem", background: "transparent", border: "none", color: "#334155", cursor: "pointer", fontSize: "0.75rem", lineHeight: 1, opacity: 0.5 }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          >
            ✎
          </button>
        </div>
      )}
    </div>
  );
}

export default function JobPosterLeadDetailPage() {
  const params = useParams();
  const leadId = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showRegenPrompt, setShowRegenPrompt] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    fetchLead(leadId)
      .then((data) => {
        if (data) setLead(data);
        else setErr("Failed to load lead");
      })
      .catch((error) => setErr(String(error)));
  }, [leadId]);

  async function reloadLead() {
    const updated = await fetchLead(leadId);
    if (updated) setLead(updated);
  }

  async function handleFieldSave(key: string, value: string) {
    const response = await fetch(`/api/lgs/job-poster-leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; data?: Partial<Lead>; error?: string };

    if (response.ok && json.data) {
      setLead((prev) => prev ? { ...prev, ...json.data } : prev);
      setActionMsg({ text: `${key.replace("_", " ")} updated.`, ok: true });
      if (key === "company_name" && lead?.latest_message) {
        setShowRegenPrompt(true);
      }
    } else {
      setActionMsg({ text: json.error ?? "Save failed", ok: false });
    }
  }

  async function handleGenerate() {
    if (!lead?.email) return;
    setGenerating(true);
    setEditing(false);
    setShowRegenPrompt(false);
    setActionMsg(null);
    try {
      const response = await fetch("/api/lgs/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, pipeline: "jobs" }),
      });
      if (response.ok) {
        setActionMsg({ text: "Message generated.", ok: true });
        await reloadLead();
      } else {
        setActionMsg({ text: getGenerateErrorMessage(response.status), ok: false });
      }
    } catch {
      setActionMsg({ text: "Generation failed, try again", ok: false });
    } finally {
      setGenerating(false);
    }
  }

  function startEdit() {
    if (!lead?.latest_message) return;
    setEditSubject(lead.latest_message.subject ?? "");
    setEditBody(lead.latest_message.body ?? "");
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!lead?.latest_message?.id) return;
    setSaving(true);
    setActionMsg(null);
    try {
      const response = await fetch(`/api/lgs/outreach/job-posters/messages/${lead.latest_message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      });
      if (response.ok) {
        setActionMsg({ text: "Message saved.", ok: true });
        setEditing(false);
        await reloadLead();
      } else {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        setActionMsg({ text: json.error ?? "Save failed", ok: false });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!lead?.latest_message?.id) return;
    setApproving(true);
    setActionMsg(null);
    try {
      const response = await fetch(`/api/lgs/outreach/job-posters/messages/${lead.latest_message.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        setActionMsg({ text: "Message approved and queued for sending.", ok: true });
        await reloadLead();
      } else {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        setActionMsg({ text: json.error ?? "Approve failed", ok: false });
      }
    } finally {
      setApproving(false);
    }
  }

  if (err) return <p style={{ color: "#f87171", padding: "2rem" }}>{err}</p>;
  if (!lead) return <p style={{ color: "#94a3b8", padding: "2rem" }}>Loading…</p>;

  const msg = lead.latest_message;
  const msgStatus = msg?.status ?? null;
  const msgColor = msgStatus ? (MSG_STATUS_COLOR[msgStatus] ?? "#475569") : "#475569";
  const location = [lead.city, lead.state, lead.country].filter(Boolean).join(", ");
  const generateDisabled = !canGenerateForLead(lead);

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/leads/job-posters" style={{ color: "#64748b", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Back to Job Poster Leads
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "1.375rem" }}>
            {lead.company_name ?? lead.contact_name ?? lead.website}
          </h1>
          {lead.category && (
            <span style={{ padding: "0.2rem 0.6rem", background: "#1e293b", borderRadius: 4, fontSize: "0.8rem", color: "#94a3b8" }}>
              {lead.category}
            </span>
          )}
          {location && (
            <span style={{ fontSize: "0.875rem", color: "#64748b" }}>{location}</span>
          )}
        </div>
      </div>

      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Lead Profile
        </h2>
        <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.85rem", lineHeight: 1.6 }}>
          Click ✎ next to any field to edit.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.1rem 2.5rem" }}>
          <EditableField label="Company" value={lead.company_name} fieldKey="company_name" onSave={handleFieldSave} />
          <EditableField label="Contact Name" value={lead.contact_name} fieldKey="contact_name" onSave={handleFieldSave} />
          <Field label="Email" value={lead.email ?? "Email not found yet"} mono />
          <Field label="Website" value={lead.website} />
          <EditableField label="Category" value={lead.category} fieldKey="category" onSave={handleFieldSave} />
          <Field label="Enrichment Status" value={lead.processing_status} />
          <EditableField label="City" value={lead.city} fieldKey="city" onSave={handleFieldSave} />
          <EditableField label="State" value={lead.state} fieldKey="state" onSave={handleFieldSave} />
          <Field label="Contact Status" value={lead.contact_status} />
          <Field label="Verification" value={lead.verification_status} />
          <Field label="Outreach Status" value={lead.outreach_status} />
          <Field label="Created" value={formatDateTime(lead.created_at)} />
          <div style={{ gridColumn: "1 / -1" }}>
            <a href={`https://${lead.website}`} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none", fontSize: "0.9rem" }}>
              Open website →
            </a>
          </div>
        </div>

        {actionMsg && !showRegenPrompt && (
          <p style={{ marginTop: "0.85rem", fontSize: "0.82rem", color: actionMsg.ok ? "#4ade80" : "#f87171" }}>
            {actionMsg.text}
          </p>
        )}
      </div>

      {showRegenPrompt && (
        <div style={{ background: "#1e2d1e", border: "1px solid #166534", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ color: "#86efac", fontSize: "0.875rem", flex: 1 }}>
            Company updated. Regenerate the outreach message with the new company details?
          </span>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating || generateDisabled}
            style={{ padding: "0.4rem 0.9rem", background: "#16a34a", border: "none", borderRadius: 6, color: "#fff", cursor: generating || generateDisabled ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 600, opacity: generateDisabled ? 0.5 : 1 }}
          >
            {generating ? "Generating…" : "Regenerate"}
          </button>
          <button
            onClick={() => setShowRegenPrompt(false)}
            style={{ padding: "0.4rem 0.75rem", background: "transparent", border: "1px solid #166534", borderRadius: 6, color: "#86efac", cursor: "pointer", fontSize: "0.85rem" }}
          >
            Keep Existing
          </button>
        </div>
      )}

      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Outreach Message
          </h2>
          {msgStatus && (
            <span style={{ padding: "0.25rem 0.625rem", background: `${msgColor}22`, border: `1px solid ${msgColor}55`, borderRadius: 4, color: msgColor, fontSize: "0.75rem", fontWeight: 600 }}>
              {MSG_STATUS_LABEL[msgStatus] ?? msgStatus}
            </span>
          )}
        </div>

        {msg ? (
          <>
            {editing ? (
              <div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ display: "block", fontSize: "0.78rem", color: "#64748b", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Subject
                  </label>
                  <input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "0.5rem 0.75rem", color: "#f8fafc", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.78rem", color: "#64748b", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Body
                  </label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={14}
                    style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "0.75rem", color: "#f8fafc", fontSize: "0.875rem", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={() => void handleSaveEdit()}
                    disabled={saving}
                    style={{ padding: "0.5rem 1rem", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: 500 }}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "0.75rem", fontSize: "0.95rem" }}>
                  {msg.subject ?? "—"}
                </div>
                {msg.body ? (
                  <div
                    style={{ color: "#cbd5e1", fontSize: "0.875rem", lineHeight: 1.75, background: "#0f172a", borderRadius: 6, padding: "1rem", marginBottom: "1rem", fontFamily: "inherit" }}
                    dangerouslySetInnerHTML={{ __html: msg.body }}
                  />
                ) : (
                  <div style={{ color: "#334155", fontSize: "0.875rem", marginBottom: "1rem" }}>—</div>
                )}
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {msgStatus === "ready" && (
                    <button
                      onClick={() => void handleApprove()}
                      disabled={approving}
                      style={{ padding: "0.5rem 1.1rem", background: "#16a34a", border: "none", borderRadius: 6, color: "#fff", cursor: approving ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: 500 }}
                    >
                      {approving ? "Approving…" : "✓ Approve & Queue"}
                    </button>
                  )}
                  {(msgStatus === "ready" || msgStatus === "approved") && (
                    <button
                      onClick={startEdit}
                      style={{ padding: "0.5rem 1rem", background: "#334155", border: "1px solid #475569", borderRadius: 6, color: "#e2e8f0", cursor: "pointer", fontSize: "0.875rem" }}
                    >
                      ✏ Edit Message
                    </button>
                  )}
                  <button
                    onClick={() => void handleGenerate()}
                    disabled={generating || generateDisabled}
                    style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: generateDisabled ? "#475569" : "#94a3b8", cursor: generating || generateDisabled ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
                  >
                    {generating ? "Generating…" : "↺ Regenerate"}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <div>
            <p style={{ color: "#64748b", marginBottom: "1rem", fontSize: "0.9rem" }}>
              No message generated yet for this lead.
            </p>
            <button
              onClick={() => void handleGenerate()}
              disabled={generating || generateDisabled}
              style={{ padding: "0.55rem 1.1rem", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: generating || generateDisabled ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: 500, opacity: generateDisabled ? 0.5 : 1 }}
            >
              {generating ? "Generating…" : "✦ Generate Message"}
            </button>
            {generateDisabled && (
              <p style={{ color: "#94a3b8", marginTop: "0.75rem", fontSize: "0.8rem" }}>
                {!lead.email ? "Email not found yet." : "Invalid emails cannot generate outreach."}
              </p>
            )}
          </div>
        )}

        {actionMsg && !showRegenPrompt && (
          <p style={{ marginTop: "0.85rem", color: actionMsg.ok ? "#4ade80" : "#f87171", fontSize: "0.875rem" }}>
            {actionMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
