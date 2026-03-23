"use client";

import Link from "next/link";
import { useState } from "react";

type Section = "email" | "message" | "discovery" | "system" | "user";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "email", label: "Email Settings", icon: "✉" },
  { id: "message", label: "Message Settings", icon: "💬" },
  { id: "discovery", label: "Discovery Settings", icon: "🔍" },
  { id: "system", label: "System Settings", icon: "⚙" },
  { id: "user", label: "User Settings", icon: "🔑" },
];

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.35rem" }}>{title}</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>{description}</p>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "1rem",
      alignItems: "center",
      padding: "1rem 0",
      borderBottom: "1px solid #1e293b",
    }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{label}</div>
        {description && <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.2rem" }}>{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 6,
        padding: "0.4rem 0.75rem",
        color: "#f8fafc",
        fontSize: "0.875rem",
        width: 180,
        outline: "none",
      }}
    />
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 6,
        padding: "0.4rem 0.75rem",
        color: "#f8fafc",
        fontSize: "0.875rem",
        width: 90,
        outline: "none",
      }}
    />
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        background: value ? "#3b82f6" : "#334155",
        position: "relative",
        transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute",
        top: 3,
        left: value ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

const pwInputStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f8fafc",
  padding: "0 12px",
  fontSize: "0.9rem",
  outline: "none",
};

function Badge({ label, color = "#94a3b8" }: { label: string; color?: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "0.15rem 0.5rem",
      borderRadius: 4,
      fontSize: "0.78rem",
      fontWeight: 600,
      color,
      background: color + "22",
    }}>
      {label}
    </span>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>("email");
  const [saved, setSaved] = useState(false);

  // Email settings
  const [dailyLimit, setDailyLimit] = useState(50);
  const [replyInbox, setReplyInbox] = useState("");
  const [emailWarmup, setEmailWarmup] = useState(false);

  // Message settings
  const [gptPrompt, setGptPrompt] = useState("You are a friendly outreach assistant for 8Fold. Write a short, personalized cold email to a contractor.");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(3);

  // Discovery settings
  const [verificationThreshold, setVerificationThreshold] = useState(85);
  const [maxEmailsPerDomain, setMaxEmailsPerDomain] = useState(10);
  const [crawlDepth, setCrawlDepth] = useState(3);
  const [rejectionPatterns, setRejectionPatterns] = useState("sentry, example, no-reply, noreply, donotreply, test@");

  // System settings
  const [dedupMode, setDedupMode] = useState("email");
  const [autoGenerate, setAutoGenerate] = useState(false);

  // User / password settings
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleChangePassword() {
    setPasswordResult(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordResult({ ok: false, message: "All fields are required." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordResult({ ok: false, message: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordResult({ ok: false, message: "New password must be at least 8 characters." });
      return;
    }
    setPasswordChanging(true);
    try {
      const resp = await fetch("/api/lgs/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await resp.json().catch(() => ({})) as { ok?: boolean; error?: { message?: string } };
      if (json.ok) {
        setPasswordResult({ ok: true, message: "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordResult({ ok: false, message: json.error?.message ?? "Failed to change password." });
      }
    } catch {
      setPasswordResult({ ok: false, message: "Request failed. Check your connection." });
    } finally {
      setPasswordChanging(false);
    }
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ marginBottom: "0.35rem" }}>Settings</h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>
          Central configuration for the LGS acquisition pipeline.
        </p>
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", borderBottom: "1px solid #334155", paddingBottom: "0" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: "0.6rem 1rem",
              border: "none",
              borderBottom: activeSection === s.id ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
              background: "transparent",
              color: activeSection === s.id ? "#f8fafc" : "#64748b",
              fontWeight: activeSection === s.id ? 600 : 400,
              fontSize: "0.875rem",
              marginBottom: "-1px",
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div style={{ background: "#1e293b", borderRadius: 10, padding: "1.5rem 2rem" }}>
        {activeSection === "email" && (
          <>
            <SectionHeader
              title="Email Settings"
              description="Manage outreach infrastructure and sender rotation."
            />

            <SettingRow label="Sender Pool" description="Manage Gmail accounts used for outreach.">
              <Link href="/settings/senders" style={{
                display: "inline-block",
                padding: "0.4rem 0.85rem",
                background: "#334155",
                borderRadius: 6,
                color: "#f8fafc",
                textDecoration: "none",
                fontSize: "0.85rem",
              }}>
                Manage Senders →
              </Link>
            </SettingRow>

            <SettingRow
              label="Daily Send Limit"
              description="Maximum emails sent per sender account per day. Default: 50."
            >
              <NumberInput value={dailyLimit} onChange={setDailyLimit} min={1} max={500} />
            </SettingRow>

            <SettingRow
              label="Reply Inbox"
              description="Email address where replies are received and monitored."
            >
              <TextInput value={replyInbox} onChange={setReplyInbox} placeholder="replies@yourdomain.com" />
            </SettingRow>

            <SettingRow
              label="Email Warmup"
              description="Gradually ramp up send volume on new sender accounts."
            >
              <Toggle value={emailWarmup} onChange={setEmailWarmup} />
            </SettingRow>

            <div style={{ marginTop: "1.25rem", padding: "0.75rem 1rem", background: "#0f172a", borderRadius: 8, fontSize: "0.82rem", color: "#64748b" }}>
              <strong style={{ color: "#94a3b8" }}>Current senders:</strong> Visit the{" "}
              <Link href="/settings/senders" style={{ color: "#38bdf8" }}>Sender Pool</Link>{" "}
              page to add or remove Gmail accounts. Each sender rotates automatically to stay under daily limits.
            </div>
          </>
        )}

        {activeSection === "message" && (
          <>
            <SectionHeader
              title="Message Settings"
              description="Control how outreach messages are generated by GPT."
            />

            <SettingRow
              label="GPT Prompt Configuration"
              description="System prompt used when generating contractor outreach emails."
            >
              <span />
            </SettingRow>
            <div style={{ marginBottom: "1rem" }}>
              <textarea
                value={gptPrompt}
                onChange={(e) => setGptPrompt(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "0.65rem 0.85rem",
                  color: "#f8fafc",
                  fontSize: "0.85rem",
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <SettingRow
              label="Auto Follow-up"
              description="Send a follow-up email if no reply after N days."
            >
              <Toggle value={followUpEnabled} onChange={setFollowUpEnabled} />
            </SettingRow>

            {followUpEnabled && (
              <SettingRow label="Follow-up Delay (days)" description="Days to wait before sending follow-up.">
                <NumberInput value={followUpDays} onChange={setFollowUpDays} min={1} max={30} />
              </SettingRow>
            )}

            <div style={{ marginTop: "1.25rem", padding: "0.75rem 1rem", background: "#0f172a", borderRadius: 8, fontSize: "0.82rem", color: "#64748b" }}>
              Generate and approve messages in bulk from the{" "}
              <Link href="/leads" style={{ color: "#38bdf8" }}>Contractor Leads</Link> page. Select leads → Generate MSG → Review → Approve.
            </div>
          </>
        )}

        {activeSection === "discovery" && (
          <>
            <SectionHeader
              title="Discovery Settings"
              description="Control how the discovery engine crawls websites and extracts emails."
            />

            <SettingRow
              label="Email Validation Rules"
              description="Used internally for obvious invalid-pattern filtering. Invalid emails are blocked; unresolved emails stay pending."
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <NumberInput value={verificationThreshold} onChange={setVerificationThreshold} min={0} max={100} />
                <Badge
                  label={verificationThreshold >= 90 ? "Strict" : verificationThreshold >= 80 ? "Standard" : "Relaxed"}
                  color={verificationThreshold >= 90 ? "#4ade80" : verificationThreshold >= 80 ? "#facc15" : "#f87171"}
                />
              </div>
            </SettingRow>

            <SettingRow
              label="Max Emails Per Domain"
              description="Maximum email addresses extracted from a single domain."
            >
              <NumberInput value={maxEmailsPerDomain} onChange={setMaxEmailsPerDomain} min={1} max={50} />
            </SettingRow>

            <SettingRow
              label="Domain Crawl Depth"
              description="Pages deep to crawl per domain (1 = homepage only)."
            >
              <NumberInput value={crawlDepth} onChange={setCrawlDepth} min={1} max={10} />
            </SettingRow>

            <SettingRow
              label="Email Rejection Patterns"
              description="Comma-separated patterns. Emails matching these are discarded before verification."
            >
              <span />
            </SettingRow>
            <div style={{ marginBottom: "1rem" }}>
              <textarea
                value={rejectionPatterns}
                onChange={(e) => setRejectionPatterns(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "0.65rem 0.85rem",
                  color: "#f8fafc",
                  fontSize: "0.85rem",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ padding: "0.75rem 1rem", background: "#0f172a", borderRadius: 8, fontSize: "0.82rem", color: "#64748b" }}>
              <strong style={{ color: "#94a3b8" }}>Current defaults (set in code):</strong>{" "}
              threshold = {verificationThreshold}, max emails = {maxEmailsPerDomain}, crawl depth = {crawlDepth}.
              Changes here will apply to new discovery runs. Existing leads are unaffected.
            </div>
          </>
        )}

        {activeSection === "system" && (
          <>
            <SectionHeader
              title="System Settings"
              description="Core LGS pipeline behavior and deduplication rules."
            />

            <SettingRow
              label="Lead Deduplication Mode"
              description="How duplicates are detected. Email-only allows multiple leads per domain."
            >
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {["email", "email+domain"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDedupMode(mode)}
                    style={{
                      padding: "0.3rem 0.65rem",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: dedupMode === mode ? "#334155" : "#0f172a",
                      color: dedupMode === mode ? "#f8fafc" : "#64748b",
                      fontSize: "0.82rem",
                      fontWeight: dedupMode === mode ? 600 : 400,
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow
              label="Auto Message Generation"
              description="Automatically generate GPT outreach messages when a lead is inserted."
            >
              <Toggle value={autoGenerate} onChange={setAutoGenerate} />
            </SettingRow>

            <div style={{ marginTop: "1.25rem", padding: "0.75rem 1rem", background: "#0f172a", borderRadius: 8, fontSize: "0.82rem", color: "#64748b" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <span>Dedup mode: <strong style={{ color: "#94a3b8" }}>{dedupMode}</strong></span>
                <span>Auto generate: <strong style={{ color: autoGenerate ? "#4ade80" : "#f87171" }}>{autoGenerate ? "On" : "Off"}</strong></span>
              </div>
            </div>
          </>
        )}

        {activeSection === "user" && (
          <>
            <SectionHeader
              title="User Settings"
              description="Change your LGS access password."
            />

            <div style={{ maxWidth: 420 }}>
              <div style={{ display: "grid", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>Current Password</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    style={pwInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>New Password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    style={pwInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>Confirm New Password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    style={pwInputStyle}
                  />
                </label>

                {passwordResult && (
                  <div style={{
                    padding: "0.6rem 0.85rem",
                    borderRadius: 7,
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    background: passwordResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                    color: passwordResult.ok ? "#4ade80" : "#f87171",
                    border: `1px solid ${passwordResult.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                  }}>
                    {passwordResult.ok ? "✓ " : "✗ "}{passwordResult.message}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleChangePassword()}
                  disabled={passwordChanging}
                  style={{
                    padding: "0.55rem 1.25rem",
                    background: passwordChanging ? "rgba(59,130,246,0.5)" : "#3b82f6",
                    border: "none",
                    borderRadius: 7,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: passwordChanging ? "default" : "pointer",
                    fontSize: "0.9rem",
                    width: "fit-content",
                  }}
                >
                  {passwordChanging ? "Changing..." : "Change Password"}
                </button>

                <div style={{ padding: "0.75rem 1rem", background: "#0f172a", borderRadius: 8, fontSize: "0.82rem", color: "#64748b" }}>
                  After changing the password here, update <code style={{ color: "#94a3b8" }}>LGS_AUTH_PASSWORD</code> in your{" "}
                  <code style={{ color: "#94a3b8" }}>apps/api/.env.local</code> to match — so the env var stays in sync if the DB is ever reset.
                </div>
              </div>
            </div>
          </>
        )}

        {/* Save button — only shown for non-user sections */}
        {activeSection !== "user" && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem", gap: "0.75rem", alignItems: "center" }}>
            {saved && <span style={{ color: "#4ade80", fontSize: "0.875rem" }}>✓ Settings saved</span>}
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: "0.5rem 1.25rem",
                background: "#3b82f6",
                border: "none",
                borderRadius: 7,
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Save Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
