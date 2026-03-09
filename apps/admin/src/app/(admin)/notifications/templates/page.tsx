"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TemplateRow = {
  id: string | null;
  notificationType: string;
  category: string;
  emailSubject: string | null;
  emailTemplate: string | null;
  inAppTemplate: string | null;
  enabledEmail: boolean;
  enabledInApp: boolean;
  supportsEmail: boolean;
  supportsInApp: boolean;
  variables: string[] | null;
  updatedAt: string | null;
  updatedBy: string | null;
  _source?: string;
};

const CATEGORIES_ORDER = [
  "Job Lifecycle",
  "Messaging",
  "Financial",
  "Support",
  "Compliance",
  "System",
  "Appraisal",
];

const SAMPLE_VARS: Record<string, string> = {
  contractor_name: "Alex Johnson",
  job_poster_name: "Sarah Williams",
  router_name: "Mike Chen",
  job_title: "Interior Painting — 3BR House",
  job_location: "Austin, TX 78701",
  job_price: "$1,250.00",
  dashboard_link: "https://app.8fold.com/dashboard",
  platform_name: "8Fold",
};

function renderTemplate(template: string, sampleVars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] ?? `{{${key}}}`);
}

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [grouped, setGrouped] = useState<Record<string, TemplateRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"email" | "inapp">("email");

  // Editor state
  const [editSubject, setEditSubject] = useState("");
  const [editEmailBody, setEditEmailBody] = useState("");
  const [editInApp, setEditInApp] = useState("");
  const [editEmailEnabled, setEditEmailEnabled] = useState(true);
  const [editInAppEnabled, setEditInAppEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/notification-templates", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load templates");
      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      setGrouped(json.grouped ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function selectTemplate(tpl: TemplateRow) {
    setSelected(tpl);
    setEditSubject(tpl.emailSubject ?? "");
    setEditEmailBody(tpl.emailTemplate ?? "");
    setEditInApp(tpl.inAppTemplate ?? "");
    setEditEmailEnabled(tpl.enabledEmail);
    setEditInAppEnabled(tpl.enabledInApp);
    setSaveMsg(null);
  }

  async function saveTemplate() {
    if (!selected) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const resp = await fetch(
        `/api/admin/v4/notification-templates/${encodeURIComponent(selected.notificationType)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            emailSubject: editSubject || null,
            emailTemplate: editEmailBody || null,
            inAppTemplate: editInApp || null,
            enabledEmail: editEmailEnabled,
            enabledInApp: editInAppEnabled,
          }),
        },
      );
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? "Failed to save");
      setSaveMsg("Saved successfully.");
      await load();
    } catch (e) {
      setSaveMsg(`Error: ${e instanceof Error ? e.message : "Failed to save"}`);
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!selected) return;
    if (!confirm(`Reset "${selected.notificationType}" to its default template? This will overwrite your edits.`)) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const resp = await fetch(
        `/api/admin/v4/notification-templates/${encodeURIComponent(selected.notificationType)}/reset`,
        { method: "POST", credentials: "include" },
      );
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? "Failed to reset");
      setSaveMsg("Reset to default.");
      await load();
      if (json.template) selectTemplate(json.template);
    } catch (e) {
      setSaveMsg(`Error: ${e instanceof Error ? e.message : "Failed to reset"}`);
    } finally {
      setSaving(false);
    }
  }

  const orderedCategories = [
    ...CATEGORIES_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORIES_ORDER.includes(c)),
  ];

  const emailPreviewHtml = selected
    ? renderTemplate(editEmailBody, SAMPLE_VARS)
    : "";

  const inAppPreviewText = selected
    ? renderTemplate(editInApp, SAMPLE_VARS)
    : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Link href="/notifications" style={{ color: "rgba(148,163,184,0.8)", textDecoration: "none", fontSize: 13 }}>
          ← Notifications
        </Link>
      </div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Email Templates</h1>
      <p style={{ marginTop: 6, color: "rgba(226,232,240,0.7)", marginBottom: 16 }}>
        Edit transactional email and in-app notification content per notification type.
      </p>

      {loading && <div style={{ color: "rgba(226,232,240,0.6)" }}>Loading templates...</div>}
      {error && <div style={{ color: "rgba(254,202,202,0.9)", fontWeight: 900 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "300px 1fr" : "1fr", gap: 16 }}>
          {/* Left: grouped list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orderedCategories.map((cat) => (
              <div key={cat}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: "rgba(148,163,184,0.8)",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    marginBottom: 6,
                    paddingLeft: 4,
                  }}
                >
                  {cat}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(grouped[cat] ?? []).map((tpl) => {
                    const isActive = selected?.notificationType === tpl.notificationType;
                    const hasEmailTpl = !!(tpl.emailSubject && tpl.emailTemplate);
                    return (
                      <button
                        key={tpl.notificationType}
                        onClick={() => selectTemplate(tpl)}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          border: `1px solid ${isActive ? "rgba(56,189,248,0.5)" : "rgba(148,163,184,0.18)"}`,
                          borderRadius: 8,
                          background: isActive ? "rgba(56,189,248,0.12)" : "rgba(15,23,42,0.4)",
                          color: isActive ? "rgba(125,211,252,0.95)" : "rgba(226,232,240,0.85)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: isActive ? 900 : 700,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ wordBreak: "break-all" }}>{tpl.notificationType}</span>
                        <span style={{ fontSize: 10, color: hasEmailTpl ? "#22c55e" : "#6b7280", flexShrink: 0 }}>
                          {hasEmailTpl ? "✉" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Right: editor + preview */}
          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.2)",
                  borderRadius: 12,
                  padding: 16,
                  background: "rgba(2,6,23,0.4)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 15 }}>{selected.notificationType}</div>
                    <div style={{ fontSize: 12, color: "rgba(148,163,184,0.8)", marginTop: 2 }}>
                      Category: {selected.category}
                      {selected._source === "default" && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            background: "rgba(250,204,21,0.15)",
                            color: "#fbbf24",
                            border: "1px solid rgba(250,204,21,0.3)",
                            borderRadius: 999,
                            padding: "1px 6px",
                          }}
                        >
                          using default
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={resetDefault} disabled={saving} style={{ ...actionBtn, background: "rgba(148,163,184,0.1)" }}>
                      Reset Default
                    </button>
                    <button onClick={saveTemplate} disabled={saving} style={actionBtn}>
                      {saving ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </div>

                {saveMsg && (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 900,
                      background: saveMsg.startsWith("Error")
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(34,197,94,0.15)",
                      color: saveMsg.startsWith("Error") ? "#fca5a5" : "#86efac",
                      border: saveMsg.startsWith("Error")
                        ? "1px solid rgba(239,68,68,0.3)"
                        : "1px solid rgba(34,197,94,0.3)",
                    }}
                  >
                    {saveMsg}
                  </div>
                )}

                {/* Channel toggles */}
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  {selected.supportsEmail && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={editEmailEnabled}
                        onChange={(e) => setEditEmailEnabled(e.target.checked)}
                      />
                      Email Enabled
                    </label>
                  )}
                  {selected.supportsInApp && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={editInAppEnabled}
                        onChange={(e) => setEditInAppEnabled(e.target.checked)}
                      />
                      In-App Enabled
                    </label>
                  )}
                </div>

                {selected.supportsEmail && (
                  <>
                    <FieldLabel>Email Subject</FieldLabel>
                    <input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      placeholder="Subject line..."
                      style={inputStyle}
                    />

                    <FieldLabel style={{ marginTop: 10 }}>Email Body (HTML)</FieldLabel>
                    <textarea
                      value={editEmailBody}
                      onChange={(e) => setEditEmailBody(e.target.value)}
                      placeholder="<p>Hello {{contractor_name}},</p>..."
                      rows={12}
                      style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
                    />
                  </>
                )}

                {selected.supportsInApp && (
                  <>
                    <FieldLabel style={{ marginTop: 10 }}>In-App Notification Text</FieldLabel>
                    <textarea
                      value={editInApp}
                      onChange={(e) => setEditInApp(e.target.value)}
                      placeholder="Short notification text..."
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </>
                )}

                {/* Variables reference */}
                {selected.variables && selected.variables.length > 0 && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(15,23,42,0.5)", borderRadius: 8, border: "1px solid rgba(148,163,184,0.15)" }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(148,163,184,0.8)", marginBottom: 6 }}>
                      Available Variables
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {selected.variables.map((v) => (
                        <code
                          key={v}
                          style={{
                            fontSize: 11,
                            background: "rgba(56,189,248,0.1)",
                            color: "rgba(125,211,252,0.9)",
                            border: "1px solid rgba(56,189,248,0.25)",
                            borderRadius: 4,
                            padding: "2px 6px",
                          }}
                        >
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.2)",
                  borderRadius: 12,
                  padding: 16,
                  background: "rgba(2,6,23,0.4)",
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <TabButton
                    active={previewMode === "email"}
                    onClick={() => setPreviewMode("email")}
                  >
                    Email Preview
                  </TabButton>
                  <TabButton
                    active={previewMode === "inapp"}
                    onClick={() => setPreviewMode("inapp")}
                  >
                    In-App Preview
                  </TabButton>
                </div>

                {previewMode === "email" && (
                  <div>
                    {editSubject && (
                      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.8)", marginBottom: 8 }}>
                        Subject: <strong style={{ color: "rgba(226,232,240,0.9)" }}>
                          {renderTemplate(editSubject, SAMPLE_VARS)}
                        </strong>
                      </div>
                    )}
                    <div
                      style={{
                        maxWidth: 560,
                        background: "#ffffff",
                        borderRadius: 8,
                        padding: 0,
                        boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        dangerouslySetInnerHTML={{ __html: emailPreviewHtml || "<p style='padding:16px;color:#6b7280;'>No email template set.</p>" }}
                      />
                    </div>
                  </div>
                )}

                {previewMode === "inapp" && (
                  <div>
                    {inAppPreviewText ? (
                      <div
                        style={{
                          border: "1px solid rgba(148,163,184,0.2)",
                          borderRadius: 10,
                          padding: "12px 14px",
                          background: "rgba(15,23,42,0.6)",
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          maxWidth: 400,
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🔔</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(226,232,240,0.95)", marginBottom: 2 }}>
                            {selected.notificationType}
                          </div>
                          <div style={{ fontSize: 13, color: "rgba(226,232,240,0.8)", lineHeight: 1.5 }}>
                            {inAppPreviewText}
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 6 }}>just now</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "rgba(148,163,184,0.7)", fontSize: 13 }}>No in-app template set.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 900,
        color: "rgba(148,163,184,0.85)",
        marginBottom: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        border: active ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(148,163,184,0.2)",
        background: active ? "rgba(56,189,248,0.15)" : "transparent",
        color: active ? "rgba(125,211,252,0.95)" : "rgba(148,163,184,0.8)",
        fontWeight: 900,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

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

const actionBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  fontWeight: 900,
  fontSize: 12,
  padding: "6px 12px",
  cursor: "pointer",
};
