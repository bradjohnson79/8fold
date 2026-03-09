"use client";

import { useState } from "react";
import Link from "next/link";

const ALL_TYPES = [
  "NEW_JOB_INVITE",
  "JOB_ROUTED",
  "CONTRACTOR_ACCEPTED",
  "JOB_ASSIGNED",
  "JOB_STARTED",
  "CONTRACTOR_COMPLETED_JOB",
  "JOB_CANCELLED_BY_CUSTOMER",
  "CONTRACTOR_CANCELLED",
  "JOB_PUBLISHED",
  "JOB_REJECTED",
  "INVITE_EXPIRED",
  "POSTER_ACCEPTED",
  "NEW_MESSAGE",
  "MESSAGE_RECEIVED",
  "PAYMENT_RECEIVED",
  "FUNDS_RELEASED",
  "PAYMENT_RELEASED",
  "REFUND_PROCESSED",
  "JOB_REFUNDED",
  "ROUTER_COMPENSATION_PROCESSED",
  "PAYMENT_EXCEPTION",
  "NEW_SUPPORT_TICKET",
  "SUPPORT_REPLY",
  "BREACH_PENALTY_APPLIED",
  "SUSPENSION_APPLIED",
  "CONTRACTOR_SUSPENDED",
  "SYSTEM_ALERT",
  "SYSTEM_ERROR_EVENT",
  "ROUTING_WINDOW_EXPIRED",
  "ROUTING_EXPIRED_NO_ACCEPT",
  "JOB_RESET_TO_QUEUE",
  "ASSIGNED_CONTRACTOR_EXPIRED",
  "JOB_CANCELLED_WITHIN_8H",
  "HIGH_VALUE_JOB_CANCELLED",
  "DISPUTE_OPENED",
  "ROUTE_INVITE",
  "RE_APPRAISAL_REQUESTED",
  "RE_APPRAISAL_ACCEPTED",
  "RE_APPRAISAL_DECLINED",
  "APPOINTMENT_BOOKED",
  "RESCHEDULE_REQUEST",
  "RESCHEDULE_ACCEPTED",
];

type SendResult = {
  ok: boolean;
  message?: string;
  subject?: string;
  templateSource?: string;
  error?: string;
};

export default function TestNotificationPage() {
  const [notificationType, setNotificationType] = useState("JOB_ROUTED");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [templateVarsRaw, setTemplateVarsRaw] = useState("{}");
  const [showVars, setShowVars] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function send() {
    if (!recipientEmail.trim() || !recipientEmail.includes("@")) {
      setResult({ ok: false, error: "Please enter a valid recipient email address." });
      return;
    }

    let templateVars: Record<string, string> | null = null;
    if (showVars && templateVarsRaw.trim() !== "{}") {
      try {
        templateVars = JSON.parse(templateVarsRaw);
      } catch {
        setResult({ ok: false, error: "Template Variables is not valid JSON." });
        return;
      }
    }

    setSending(true);
    setResult(null);

    try {
      const resp = await fetch("/api/admin/v4/notifications/send-test", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationType,
          recipientEmail: recipientEmail.trim(),
          templateVars: templateVars ?? undefined,
        }),
      });
      const json: SendResult = await resp.json().catch(() => ({ ok: false, error: "Failed to parse response" }));
      setResult(json);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Link href="/notifications" style={{ color: "rgba(148,163,184,0.8)", textDecoration: "none", fontSize: 13 }}>
          ← Notifications
        </Link>
      </div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Send Test Notification</h1>
      <p style={{ marginTop: 6, color: "rgba(226,232,240,0.7)", marginBottom: 20 }}>
        Send a test email using the active template for any notification type.
        <br />
        <span style={{ color: "rgba(250,204,21,0.85)", fontSize: 12, fontWeight: 700 }}>
          Test sends are logged with is_test=true and never create in-app notifications.
        </span>
      </p>

      <div
        style={{
          border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: 12,
          padding: 20,
          background: "rgba(2,6,23,0.4)",
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <label style={labelStyle}>Notification Type</label>
          <select
            value={notificationType}
            onChange={(e) => setNotificationType(e.target.value)}
            style={inputStyle}
          >
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Recipient Email</label>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="admin@example.com"
            style={inputStyle}
          />
        </div>

        <div>
          <button
            onClick={() => setShowVars((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(148,163,184,0.8)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {showVars ? "▾" : "▸"} Override Template Variables (optional)
          </button>

          {showVars && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", marginBottom: 4 }}>
                JSON object — keys match template variables like contractor_name, job_title, etc.
              </div>
              <textarea
                value={templateVarsRaw}
                onChange={(e) => setTemplateVarsRaw(e.target.value)}
                rows={6}
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
                placeholder={'{\n  "contractor_name": "Jane Smith",\n  "job_title": "Roof Repair"\n}'}
              />
            </div>
          )}
        </div>

        <button
          onClick={() => void send()}
          disabled={sending}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid rgba(56,189,248,0.5)",
            background: sending ? "rgba(56,189,248,0.06)" : "rgba(56,189,248,0.18)",
            color: "rgba(125,211,252,0.95)",
            fontWeight: 900,
            fontSize: 14,
            cursor: sending ? "not-allowed" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          {sending ? "Sending..." : "Send Test Email"}
        </button>

        {result && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: result.ok
                ? "1px solid rgba(34,197,94,0.35)"
                : "1px solid rgba(239,68,68,0.35)",
              background: result.ok
                ? "rgba(34,197,94,0.1)"
                : "rgba(239,68,68,0.1)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 13, color: result.ok ? "#86efac" : "#fca5a5", marginBottom: 6 }}>
              {result.ok ? "Test Email Sent" : "Send Failed"}
            </div>
            {result.message && (
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.85)" }}>{result.message}</div>
            )}
            {result.subject && (
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)", marginTop: 4 }}>
                Subject: <strong>{result.subject}</strong>
              </div>
            )}
            {result.templateSource && (
              <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", marginTop: 4 }}>
                Template source: {result.templateSource}
              </div>
            )}
            {result.error && (
              <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 4 }}>{result.error}</div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(15,23,42,0.5)",
          border: "1px solid rgba(148,163,184,0.15)",
          maxWidth: 520,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(148,163,184,0.85)", marginBottom: 6 }}>
          How this works
        </div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "rgba(226,232,240,0.7)", lineHeight: 1.7 }}>
          <li>The active template for the selected type is fetched (DB → default fallback).</li>
          <li>Variables are filled with sample values unless you override them.</li>
          <li>A real email is sent to the recipient address via SMTP.</li>
          <li>The send is logged in Delivery Logs with <code style={{ fontSize: 11 }}>is_test=true</code>.</li>
          <li>No in-app notification is created — your users&apos; feeds are not affected.</li>
        </ul>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(148,163,184,0.85)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(15,23,42,0.5)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
  fontSize: 13,
};
