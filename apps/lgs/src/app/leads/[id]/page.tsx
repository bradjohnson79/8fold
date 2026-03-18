"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";

type Message = {
  id: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  created_at: string | null;
  reviewed_at: string | null;
};

type SecondaryEmail = {
  email: string;
  score: number;
};

type Lead = {
  id: string;
  lead_number: number | null;
  lead_name: string | null;
  business_name: string | null;
  email: string;
  email_type: string | null;
  primary_email_score: number | null;
  secondary_emails: SecondaryEmail[] | null;
  website: string | null;
  phone: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string | null;
  status: string | null;
  contact_status: string;
  contact_attempts: number;
  response_received: boolean;
  signed_up: boolean;
  verification_score: number | null;
  verification_status: string | null;
  email_bounced: boolean | null;
  discovery_method: string | null;
  notes: string | null;
  created_at: string | null;
  latest_message: Message | null;
};

const MSG_STATUS_LABEL: Record<string, string> = {
  pending_review: "MSG Ready",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
};

const MSG_STATUS_COLOR: Record<string, string> = {
  pending_review: "#2563eb",
  approved: "#16a34a",
  rejected: "#dc2626",
  sent: "#7c3aed",
};

async function fetchLead(leadId: string): Promise<Lead | null> {
  const r = await lgsFetch<Lead>(`/api/lgs/leads/${leadId}`);
  const raw = r as unknown as { ok: boolean; data: Lead; error?: string };
  return raw.ok && raw.data ? raw.data : null;
}

// ─── Inline editable field ────────────────────────────────────────────────

type EditableFieldProps = {
  label: string;
  value: string | null | undefined;
  fieldKey: string;
  mono?: boolean;
  onSave: (key: string, value: string) => Promise<void>;
};

function EditableField({ label, value, fieldKey, mono = false, onSave }: EditableFieldProps) {
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
              fontSize: mono ? "0.82rem" : "0.9rem",
              fontFamily: mono ? "monospace" : "inherit",
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
          <span
            style={{
              color: value ? "#e2e8f0" : "#334155",
              fontFamily: mono ? "monospace" : undefined,
              fontSize: mono ? "0.82rem" : "0.9rem",
            }}
          >
            {value ?? "—"}
          </span>
          <button
            onClick={() => { setDraft(value ?? ""); setEditing(true); }}
            title="Edit"
            style={{
              padding: "0 0.3rem",
              background: "transparent",
              border: "none",
              color: "#334155",
              cursor: "pointer",
              fontSize: "0.75rem",
              lineHeight: 1,
              opacity: 0.5,
            }}
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

// ─── Read-only field ──────────────────────────────────────────────────────

function Field({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ color: value ? "#e2e8f0" : "#334155", fontFamily: mono ? "monospace" : undefined, fontSize: mono ? "0.82rem" : "0.9rem" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Inline message editing state
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Regenerate-after-field-change prompt
  const [showRegenPrompt, setShowRegenPrompt] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    fetchLead(leadId)
      .then((data) => {
        if (data) setLead(data);
        else setErr("Failed to load lead");
      })
      .catch((e) => setErr(String(e)));
  }, [leadId]);

  // ── Field save handler ───────────────────────────────────────────────────
  async function handleFieldSave(key: string, value: string) {
    if (!lead) return;
    setActionMsg(null);

    const res = await fetch(`/api/lgs/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: Partial<Lead>;
      error?: string;
    };

    if (res.ok && json.data) {
      // Merge the updated fields back into the lead without a full reload
      setLead((prev) => prev ? { ...prev, ...json.data } : prev);
      setActionMsg({ text: `${key.replace("_", " ")} updated.`, ok: true });

      // Offer to regenerate message if business_name changed and a message exists
      if (key === "business_name" && lead.latest_message) {
        setShowRegenPrompt(true);
      }
    } else {
      setActionMsg({ text: json.error ?? "Save failed", ok: false });
    }
  }

  // ── Message actions ──────────────────────────────────────────────────────
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
      const res = await fetch(`/api/lgs/messages/${lead.latest_message.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      });
      if (res.ok) {
        setActionMsg({ text: "Message saved.", ok: true });
        setEditing(false);
        const updated = await fetchLead(leadId);
        if (updated) setLead(updated);
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setActionMsg({ text: j.error ?? "Save failed", ok: false });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setEditing(false);
    setShowRegenPrompt(false);
    setActionMsg(null);
    try {
      const res = await fetch("/api/lgs/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (res.ok) {
        setActionMsg({ text: "Message generated.", ok: true });
        const updated = await fetchLead(leadId);
        if (updated) setLead(updated);
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setActionMsg({ text: j.error ?? "Generate failed", ok: false });
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!lead?.latest_message?.id) return;
    setApproving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/lgs/messages/${lead.latest_message.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setActionMsg({ text: "Message approved and queued for sending.", ok: true });
        const updated = await fetchLead(leadId);
        if (updated) setLead(updated);
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setActionMsg({ text: j.error ?? "Approve failed", ok: false });
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

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/leads" style={{ color: "#64748b", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Back to Leads
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "1.375rem" }}>
            {lead.lead_number != null ? (
              <span style={{ color: "#475569", fontWeight: 400, marginRight: "0.5rem" }}>
                #{String(lead.lead_number).padStart(4, "0")}
              </span>
            ) : null}
            {lead.business_name ?? lead.lead_name ?? lead.email}
          </h1>
          {lead.trade && (
            <span style={{ padding: "0.2rem 0.6rem", background: "#1e293b", borderRadius: 4, fontSize: "0.8rem", color: "#94a3b8" }}>
              {lead.trade}
            </span>
          )}
          {location && (
            <span style={{ fontSize: "0.875rem", color: "#64748b" }}>{location}</span>
          )}
        </div>
      </div>

      {/* Lead profile card */}
      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Lead Profile
        </h2>
        <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.85rem", lineHeight: 1.6 }}>
          Click ✎ next to any field to edit.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.1rem 2.5rem" }}>
          <EditableField label="Contact Name" value={lead.lead_name} fieldKey="lead_name" onSave={handleFieldSave} />
          <EditableField label="Business" value={lead.business_name} fieldKey="business_name" onSave={handleFieldSave} />
          <Field label="Email" value={lead.email} mono />
          <Field label="Email Type" value={lead.email_type} />
          <Field label="Website" value={lead.website} />
          <Field label="Phone" value={lead.phone} />
          <EditableField label="Trade" value={lead.trade} fieldKey="trade" onSave={handleFieldSave} />
          <Field
            label="Verification"
            value={
              lead.verification_score != null
                ? `${lead.verification_score} (${lead.verification_status ?? "—"})`
                : null
            }
          />
          <EditableField label="City" value={lead.city} fieldKey="city" onSave={handleFieldSave} />
          <EditableField label="State" value={lead.state} fieldKey="state" onSave={handleFieldSave} />
          <Field label="Country" value={lead.country} />
          <Field label="Contact Status" value={lead.contact_status} />
          <Field label="Discovery Method" value={lead.discovery_method} />
          <Field label="Bounced" value={lead.email_bounced ? "Yes" : "No"} />
          <Field label="Created" value={lead.created_at ? new Date(lead.created_at).toLocaleString() : null} />
          {lead.notes && <div style={{ gridColumn: "1 / -1" }}><Field label="Notes" value={lead.notes} /></div>}
        </div>

        {/* Field action message */}
        {actionMsg && !showRegenPrompt && (
          <p style={{ marginTop: "0.85rem", fontSize: "0.82rem", color: actionMsg.ok ? "#4ade80" : "#f87171" }}>
            {actionMsg.text}
          </p>
        )}
      </div>

      {/* Contact Emails — shows primary selection + all secondary emails discovered */}
      {(lead.primary_email_score != null || (lead.secondary_emails && lead.secondary_emails.length > 0)) && (
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Contact Emails
          </h2>

          {/* Primary email */}
          <div style={{ marginBottom: lead.secondary_emails && lead.secondary_emails.length > 0 ? "1rem" : 0 }}>
            <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Primary Outreach Email
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: "0.88rem" }}>
                {lead.email}
              </span>
              {lead.primary_email_score != null && (
                <span style={{
                  padding: "1px 7px",
                  background: lead.primary_email_score >= 100 ? "#14532d" : lead.primary_email_score >= 80 ? "#1e3a5f" : lead.primary_email_score >= 60 ? "#1e293b" : "#1a1a2e",
                  border: `1px solid ${lead.primary_email_score >= 100 ? "#22c55e" : lead.primary_email_score >= 80 ? "#3b82f6" : lead.primary_email_score >= 60 ? "#475569" : "#334155"}`,
                  borderRadius: 4,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: lead.primary_email_score >= 100 ? "#4ade80" : lead.primary_email_score >= 80 ? "#60a5fa" : lead.primary_email_score >= 60 ? "#94a3b8" : "#64748b",
                }}>
                  score {lead.primary_email_score}
                </span>
              )}
              <span style={{ padding: "1px 7px", background: "#0f2e1f", border: "1px solid #22c55e", borderRadius: 4, fontSize: "0.7rem", fontWeight: 700, color: "#4ade80" }}>
                primary
              </span>
            </div>
          </div>

          {/* Secondary emails */}
          {lead.secondary_emails && lead.secondary_emails.length > 0 && (
            <div>
              <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Other Discovered Emails ({lead.secondary_emails.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {lead.secondary_emails.map((se) => (
                  <div key={se.email} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: "0.85rem" }}>
                      {se.email}
                    </span>
                    <span style={{
                      padding: "1px 6px",
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 4,
                      fontSize: "0.7rem",
                      color: "#475569",
                    }}>
                      score {se.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Regenerate-after-name-change prompt */}
      {showRegenPrompt && (
        <div style={{ background: "#1e2d1e", border: "1px solid #166534", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ color: "#86efac", fontSize: "0.875rem", flex: 1 }}>
            Business name updated. Regenerate the outreach message with the new name?
          </span>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            style={{ padding: "0.4rem 0.9rem", background: "#16a34a", border: "none", borderRadius: 6, color: "#fff", cursor: generating ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 600 }}
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

      {/* Outreach message card */}
      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.85rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Outreach Message
          </h2>
          {msgStatus && (
            <span style={{
              padding: "0.25rem 0.625rem",
              background: `${msgColor}22`,
              border: `1px solid ${msgColor}55`,
              borderRadius: 4,
              color: msgColor,
              fontSize: "0.75rem",
              fontWeight: 600,
            }}>
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
                    style={{
                      width: "100%",
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      padding: "0.5rem 0.75rem",
                      color: "#f8fafc",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
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
                    style={{
                      width: "100%",
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      padding: "0.75rem",
                      color: "#f8fafc",
                      fontSize: "0.875rem",
                      lineHeight: 1.7,
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
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
                {/* Render HTML body safely */}
                {msg.body ? (
                  <div
                    style={{
                      color: "#cbd5e1",
                      fontSize: "0.875rem",
                      lineHeight: 1.75,
                      background: "#0f172a",
                      borderRadius: 6,
                      padding: "1rem",
                      marginBottom: "1rem",
                      fontFamily: "inherit",
                    }}
                    dangerouslySetInnerHTML={{ __html: msg.body }}
                  />
                ) : (
                  <div style={{ color: "#334155", fontSize: "0.875rem", marginBottom: "1rem" }}>—</div>
                )}

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {msgStatus === "pending_review" && (
                    <button
                      onClick={() => void handleApprove()}
                      disabled={approving}
                      style={{ padding: "0.5rem 1.1rem", background: "#16a34a", border: "none", borderRadius: 6, color: "#fff", cursor: approving ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: 500 }}
                    >
                      {approving ? "Approving…" : "✓ Approve & Queue"}
                    </button>
                  )}
                  {(msgStatus === "pending_review" || msgStatus === "approved") && (
                    <button
                      onClick={startEdit}
                      style={{ padding: "0.5rem 1rem", background: "#334155", border: "1px solid #475569", borderRadius: 6, color: "#e2e8f0", cursor: "pointer", fontSize: "0.875rem" }}
                    >
                      ✏ Edit Message
                    </button>
                  )}
                  <button
                    onClick={() => void handleGenerate()}
                    disabled={generating}
                    style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid #475569", borderRadius: 6, color: "#94a3b8", cursor: generating ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
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
              disabled={generating}
              style={{ padding: "0.55rem 1.1rem", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", cursor: generating ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: 500 }}
            >
              {generating ? "Generating…" : "✦ Generate Message"}
            </button>
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
