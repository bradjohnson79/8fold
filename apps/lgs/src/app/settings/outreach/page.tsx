"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";

type OutreachSettings = {
  min_lead_score_to_queue: number;
  domain_cooldown_days: number;
  followup1_delay_days: number;
  followup2_delay_days: number;
  max_followups_per_lead: number;
  auto_generate_followups: boolean;
  require_followup_approval: boolean;
  max_sends_per_company_30d: number;
  min_sender_health_level: string;
};

const HEALTH_ORDER = ["good", "warning", "risk"] as const;

const SETTINGS_META: Array<{
  key: keyof OutreachSettings;
  label: string;
  help: string;
  type: "number" | "boolean" | "health_select";
  min?: number;
  max?: number;
}> = [
  {
    key: "min_lead_score_to_queue",
    label: "Minimum Lead Score to Queue",
    help: "Leads below this score will not be added to the send queue. Set to 0 to allow all leads. Range: 0–100.",
    type: "number",
    min: 0,
    max: 100,
  },
  {
    key: "domain_cooldown_days",
    label: "Domain Cooldown (Days)",
    help: "Minimum days between outreach attempts to the same company domain. Prevents contacting the same company too frequently.",
    type: "number",
    min: 0,
    max: 90,
  },
  {
    key: "followup1_delay_days",
    label: "Follow-up 1 Delay (Days)",
    help: "Days after initial send before the first follow-up message is generated. Recommended: 3–5 days.",
    type: "number",
    min: 1,
    max: 30,
  },
  {
    key: "followup2_delay_days",
    label: "Follow-up 2 Delay (Days)",
    help: "Days after follow-up 1 before the second follow-up is generated. Recommended: 5–7 days.",
    type: "number",
    min: 1,
    max: 30,
  },
  {
    key: "max_followups_per_lead",
    label: "Max Follow-ups Per Lead",
    help: "Maximum number of follow-up messages per lead before the lead is auto-paused. Set to 0 to disable follow-ups entirely.",
    type: "number",
    min: 0,
    max: 5,
  },
  {
    key: "auto_generate_followups",
    label: "Auto-Generate Follow-ups",
    help: "Automatically generate follow-up messages when the delay expires. If off, follow-ups must be created manually.",
    type: "boolean",
  },
  {
    key: "require_followup_approval",
    label: "Require Approval for Follow-ups",
    help: "Follow-up messages require manual review and approval before entering the send queue. Recommended: on.",
    type: "boolean",
  },
  {
    key: "max_sends_per_company_30d",
    label: "Max Sends Per Company (30 Days)",
    help: "Maximum total outreach sends to any single company domain within a 30-day window. Prevents over-contacting the same company.",
    type: "number",
    min: 1,
    max: 20,
  },
  {
    key: "min_sender_health_level",
    label: "Minimum Sender Health Level",
    help: "Minimum health level required for a sender to send outreach. 'risk' allows all senders. 'good' restricts to only healthy senders. Use 'warning' for a balanced approach.",
    type: "health_select",
  },
];

export default function OutreachSettingsPage() {
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [form, setForm] = useState<OutreachSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lgsFetch<{ data: OutreachSettings }>("/api/lgs/outreach/brain/settings")
      .then((r) => {
        if (r.ok && r.data) {
          const d = (r.data as { data: OutreachSettings }).data;
          setSettings(d);
          setForm(d);
        } else {
          setErr(r.error ?? "Failed to load settings");
        }
      })
      .catch((e) => setErr(String(e)));
  }, []);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/lgs/outreach/brain/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) {
        setSettings(form);
        setSaveMsg("Settings saved");
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg(`Error: ${json.error ?? "save_failed"}`);
      }
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof OutreachSettings>(key: K, value: OutreachSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(settings);

  if (err) {
    return (
      <div>
        <h1>Outreach Settings</h1>
        <p style={{ color: "#f87171" }}>{err}</p>
        <Link href="/outreach/brain" style={{ color: "#94a3b8" }}>← Brain Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
          <Link href="/outreach/brain" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>
            ← Brain Dashboard
          </Link>
        </div>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Outreach Settings</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: 13 }}>
          Configure the Outreach Brain — these settings control lead filtering, follow-up timing, sender selection, and queue behavior.
        </p>
      </div>

      {!form ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {SETTINGS_META.map((meta) => (
              <div
                key={meta.key}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: "1.25rem 1.5rem",
                }}
              >
                <label
                  style={{ display: "block", fontWeight: 600, color: "#f1f5f9", marginBottom: "0.4rem", fontSize: 14 }}
                  htmlFor={meta.key}
                >
                  {meta.label}
                </label>
                <p style={{ margin: "0 0 0.75rem", color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
                  {meta.help}
                </p>

                {meta.type === "number" && (
                  <input
                    id={meta.key}
                    type="number"
                    value={(form[meta.key] as number) ?? 0}
                    min={meta.min}
                    max={meta.max}
                    onChange={(e) =>
                      updateField(meta.key, Number(e.target.value) as OutreachSettings[typeof meta.key])
                    }
                    style={{
                      width: 120,
                      padding: "0.5rem 0.75rem",
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      color: "#f1f5f9",
                      fontSize: 14,
                    }}
                  />
                )}

                {meta.type === "boolean" && (
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        onClick={() =>
                          updateField(meta.key, val as OutreachSettings[typeof meta.key])
                        }
                        style={{
                          padding: "0.4rem 1.25rem",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                          background:
                            form[meta.key] === val
                              ? val
                                ? "#16a34a22"
                                : "#dc262622"
                              : "#0f172a",
                          border:
                            form[meta.key] === val
                              ? val
                                ? "1px solid #16a34a88"
                                : "1px solid #dc262688"
                              : "1px solid #334155",
                          color:
                            form[meta.key] === val
                              ? val
                                ? "#22c55e"
                                : "#ef4444"
                              : "#64748b",
                        }}
                      >
                        {val ? "On" : "Off"}
                      </button>
                    ))}
                  </div>
                )}

                {meta.type === "health_select" && (
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    {HEALTH_ORDER.map((level) => {
                      const colors: Record<string, string> = { good: "#22c55e", warning: "#f59e0b", risk: "#ef4444" };
                      const c = colors[level]!;
                      const selected = form[meta.key] === level;
                      return (
                        <button
                          key={level}
                          onClick={() =>
                            updateField(meta.key, level as OutreachSettings[typeof meta.key])
                          }
                          style={{
                            padding: "0.4rem 1.25rem",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            textTransform: "capitalize",
                            background: selected ? `${c}22` : "#0f172a",
                            border: selected ? `1px solid ${c}88` : "1px solid #334155",
                            color: selected ? c : "#64748b",
                          }}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save bar */}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              background: "#0f172a",
              borderTop: "1px solid #334155",
              padding: "1rem 0",
              marginTop: "2rem",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              style={{
                padding: "0.6rem 1.5rem",
                background: hasChanges ? "#3b82f6" : "#1e293b",
                border: "none",
                borderRadius: 6,
                color: hasChanges ? "#fff" : "#475569",
                cursor: hasChanges ? "pointer" : "default",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {saveMsg && (
              <span
                style={{
                  fontSize: 13,
                  color: saveMsg.startsWith("Error") ? "#f87171" : "#22c55e",
                }}
              >
                {saveMsg}
              </span>
            )}
            {!hasChanges && !saveMsg && (
              <span style={{ fontSize: 12, color: "#475569" }}>No unsaved changes</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
