"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminTheme, setAdminTheme } from "@/components/theme/ThemeInit";

type AdminMe = {
  admin: {
    id: string;
    email: string;
    role: string;
    createdAt?: string | null;
    fullName?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    address?: string | null;
  };
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 16,
    background: "var(--card-bg)",
  };
}

function labelStyle(): React.CSSProperties {
  return { display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 900 };
}

function inputStyle(): React.CSSProperties {
  return {
    marginTop: 6,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--input-bg)",
    color: "var(--text)",
    outline: "none",
  };
}

export default function SettingsClient() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [me, setMe] = useState<AdminMe["admin"] | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);

  useEffect(() => {
    setTheme(getAdminTheme());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMeError(null);
      const resp = await fetch("/api/admin/me", { method: "GET" }).catch(() => null);
      if (!resp) {
        if (!cancelled) setMeError("Failed to load admin profile.");
        return;
      }
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok || !json || json.ok !== true || !json.data?.admin) {
        if (!cancelled) setMeError("Failed to load admin profile.");
        return;
      }
      if (!cancelled) setMe(json.data.admin as any);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canChangePassword = useMemo(() => {
    if (pwBusy) return false;
    if (currentPassword.trim().length < 1) return false;
    if (newPassword.trim().length < 8) return false;
    if (newPassword !== confirmPassword) return false;
    return true;
  }, [pwBusy, currentPassword, newPassword, confirmPassword]);

  async function handleChangePassword() {
    setPwBusy(true);
    setPwError(null);
    setPwOk(null);
    try {
      const resp = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setPwError(resp.status === 401 ? "Current password is incorrect." : "Password change failed.");
        return;
      }
      setPwOk("Password updated. Please log in again.");
      // Session is revoked server-side; send user to login.
      setTimeout(() => {
        window.location.href = "/login";
      }, 600);
    } catch {
      setPwError("Password change failed.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Settings</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 980 }}>
        Site and admin preferences. Theme is stored locally per browser.
      </p>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <section style={cardStyle()}>
          <div style={{ fontWeight: 950 }}>Appearance</div>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>Toggle day/night mode for the dashboard UI.</div>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setAdminTheme("dark");
                setTheme("dark");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: theme === "dark" ? "rgba(34,197,94,0.14)" : "var(--input-bg)",
                color: "var(--text)",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminTheme("light");
                setTheme("light");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: theme === "light" ? "rgba(34,197,94,0.14)" : "var(--input-bg)",
                color: "var(--text)",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Light
            </button>
          </div>
        </section>

        <section style={cardStyle()}>
          <div style={{ fontWeight: 950 }}>Admin profile</div>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>Read-only identity details for this admin session.</div>
          {meError ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{meError}</div> : null}
          {me ? (
            <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--muted)" }}>Email:</span> <code>{me.email}</code>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Role:</span> <code>{me.role}</code>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Admin ID:</span> <code>{me.id}</code>
              </div>
              {me.fullName ? (
                <div>
                  <span style={{ color: "var(--muted)" }}>Name:</span> <code>{me.fullName}</code>
                </div>
              ) : null}
              {me.createdAt ? (
                <div>
                  <span style={{ color: "var(--muted)" }}>Created:</span> <code>{String(me.createdAt)}</code>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section style={cardStyle()}>
          <div style={{ fontWeight: 950 }}>Change password</div>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Requires your current password. After changing, you will be logged out.
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle()}>Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle()}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle()}>New password (min 8 chars)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle()}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle()}>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle()}
            />
          </div>

          {pwError ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontSize: 13, fontWeight: 900 }}>{pwError}</div> : null}
          {pwOk ? <div style={{ marginTop: 10, color: "rgba(134,239,172,0.95)", fontSize: 13, fontWeight: 900 }}>{pwOk}</div> : null}

          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              disabled={!canChangePassword}
              onClick={() => void handleChangePassword()}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(56,189,248,0.35)",
                background: pwBusy ? "rgba(56,189,248,0.08)" : "rgba(56,189,248,0.12)",
                color: "rgba(125,211,252,0.95)",
                fontWeight: 950,
                cursor: pwBusy ? "default" : "pointer",
                opacity: canChangePassword ? 1 : 0.6,
              }}
            >
              {pwBusy ? "Updating..." : "Update password"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

