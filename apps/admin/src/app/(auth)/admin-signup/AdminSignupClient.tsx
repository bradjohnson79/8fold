"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function AdminSignupClient() {
  const sp = useSearchParams();
  const codeFromUrl = (sp.get("code") ?? "").trim();
  const backHref = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "").trim() || "/";
  const initialSecret = useMemo(() => codeFromUrl, [codeFromUrl]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminSecret, setAdminSecret] = useState(initialSecret);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, adminSecret }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(resp.status === 403 ? "Invalid admin secret code" : "Signup failed");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#070b14", color: "#e2e8f0" }}>
      <div
        style={{
          width: 520,
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Create Admin Account</div>
        <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          This creates an internal <code>AdminUser</code>. You will need the Admin Secret Code.
        </div>

        {success ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "rgba(134,239,172,0.95)", fontWeight: 950, fontSize: 13 }}>Admin account created.</div>
            <div style={{ marginTop: 8 }}>
              <Link href="/login" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
                Go to login →
              </Link>
            </div>
          </div>
        ) : (
          <>
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
                Password (min 8 chars)
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
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
                Admin Secret Code
              </label>
              <input
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder={codeFromUrl ? "" : "Enter the secret code"}
                autoComplete="off"
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
              {codeFromUrl ? (
                <div style={{ marginTop: 6, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                  Prefilled from URL param <code>?code=...</code>
                </div>
              ) : null}
            </div>

            {error ? (
              <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontSize: 13, fontWeight: 900 }}>{error}</div>
            ) : null}

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={busy || !email.trim() || password.trim().length < 8 || adminSecret.trim().length < 8}
                onClick={() => void submit()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(56,189,248,0.35)",
                  background: busy ? "rgba(56,189,248,0.08)" : "rgba(56,189,248,0.12)",
                  color: "rgba(125,211,252,0.95)",
                  fontWeight: 950,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy || !email.trim() || password.trim().length < 8 || adminSecret.trim().length < 8 ? 0.6 : 1,
                }}
              >
                {busy ? "Creating..." : "Create admin"}
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
          <Link href="/login" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
            Back to login
          </Link>
          <span style={{ color: "rgba(226,232,240,0.55)" }}>Access is provisioned internally</span>
        </div>
      </div>
    </div>
  );
}

