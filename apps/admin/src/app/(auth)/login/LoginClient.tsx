"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginClient() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const backHref = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "").trim() || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError("Invalid email or password");
        return;
      }
      window.location.href = next;
    } catch {
      setError("Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#070b14", color: "#e2e8f0" }}>
      <form
        onSubmit={(e) => void submit(e)}
        style={{
          width: 420,
          maxWidth: "92vw",
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 16,
          padding: 16,
          background: "rgba(2,6,23,0.35)",
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <Link href={backHref} style={{ color: "rgba(226,232,240,0.85)", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
            ← Back to 8Fold
          </Link>
        </div>
        <div style={{ fontWeight: 950, fontSize: 18 }}>Admin login</div>
        <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          Sign in with your AdminUser email + password.
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "rgba(226,232,240,0.7)", fontWeight: 900 }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            autoComplete="email"
            style={{
              marginTop: 6,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.22)",
              background: "rgba(2,6,23,0.25)",
              color: "rgba(226,232,240,0.95)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "rgba(226,232,240,0.7)", fontWeight: 900 }}>
            Password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            style={{
              marginTop: 6,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.22)",
              background: "rgba(2,6,23,0.25)",
              color: "rgba(226,232,240,0.95)",
              outline: "none",
            }}
          />
        </div>

        {error ? (
          <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontSize: 13, fontWeight: 900 }}>{error}</div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={busy || !email.trim() || !password.trim()}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(56,189,248,0.35)",
              background: busy ? "rgba(56,189,248,0.08)" : "rgba(56,189,248,0.12)",
              color: "rgba(125,211,252,0.95)",
              fontWeight: 950,
              cursor: busy ? "default" : "pointer",
              opacity: busy || !email.trim() || !password.trim() ? 0.6 : 1,
            }}
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
          <Link href="/admin-signup" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
            Create an Admin Account
          </Link>
          <span style={{ color: "rgba(226,232,240,0.55)" }}>Access is provisioned internally</span>
        </div>
      </form>
    </div>
  );
}

