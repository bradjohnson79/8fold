"use client";

import { useEffect, useState } from "react";
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

export default function SettingsClient() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [me, setMe] = useState<AdminMe["admin"] | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    setTheme(getAdminTheme());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMeError(null);
      const resp = await fetch("/api/admin/v4/auth/me", { method: "GET" }).catch(() => null);
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
          <div style={{ fontWeight: 950 }}>Credentials and MFA</div>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Admin authentication is managed by the sovereign session system. Rotate passwords and manage access in secure admin operations.
          </div>
          <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
            If you cannot sign in, request an admin role review and credential reset from platform operations.
          </div>
        </section>
      </div>
    </div>
  );
}
