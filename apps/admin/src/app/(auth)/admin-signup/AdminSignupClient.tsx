"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminAuthFetch } from "@/lib/authClient";

export default function AdminSignupClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const codeFromUrl = (sp.get("code") ?? "").trim();

  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const secretRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (codeFromUrl && secretRef.current) {
      secretRef.current.value = codeFromUrl;
    }
  }, [codeFromUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk(false);
    try {
      const email = (emailRef.current?.value ?? "").trim();
      const password = (passwordRef.current?.value ?? "").trim();
      const adminSecret = (secretRef.current?.value ?? "").trim();
      if (!email || !password || !adminSecret) {
        setError("Missing required fields");
        return;
      }

      const result = await adminAuthFetch("/api/admin/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, adminSecret }),
      }, {
        redirectOnAuthError: false,
      });
      if (!result.ok) {
        const msg = String(result.error || (result.status === 403 ? "Forbidden" : "Signup failed"));
        console.error("[ADMIN:signup:client:error]", {
          status: result.status,
          message: "Signup request failed",
        });
        setError(msg);
        return;
      }

      setOk(true);
      // Send user back to login with a hint; they can now login with password.
      router.replace("/login");
    } catch (err) {
      console.error("[ADMIN:signup:client:error]", {
        message: "Signup submission failed",
        cause: err instanceof Error ? err.message : "Unknown error",
      });
      setError("Signup failed");
    } finally {
      setLoading(false);
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Create Admin Account</div>
        <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          You must have an Admin Signup Secret (see <code style={{ color: "rgba(226,232,240,0.9)" }}>scripts/admin-signup-secret.md</code>).
        </div>

        {error ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}
        {ok ? <div style={{ marginTop: 10, color: "rgba(134,239,172,0.95)", fontWeight: 900 }}>Admin created.</div> : null}

        <form onSubmit={(e) => void submit(e)} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.72)", fontWeight: 800 }}>Email</div>
            <input
              ref={emailRef}
              placeholder="bradjohnson79@gmail.com"
              autoComplete="email"
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(2,6,23,0.35)",
                color: "rgba(226,232,240,0.92)",
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.72)", fontWeight: 800 }}>Password</div>
            <input
              ref={passwordRef}
              type="password"
              placeholder="Choose a strong password"
              autoComplete="new-password"
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(2,6,23,0.35)",
                color: "rgba(226,232,240,0.92)",
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.72)", fontWeight: 800 }}>Admin Signup Secret</div>
            <input
              ref={secretRef}
              placeholder="Paste secret code"
              autoComplete="off"
              style={{
                marginTop: 6,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(2,6,23,0.35)",
                color: "rgba(226,232,240,0.92)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(251,191,36,0.35)",
              background: "rgba(251,191,36,0.12)",
              color: "rgba(253,230,138,0.95)",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            {loading ? "Creating…" : "Create admin"}
          </button>

          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
            <Link href="/login" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
              Back to login
            </Link>
            {codeFromUrl ? (
              <span style={{ color: "rgba(226,232,240,0.55)" }}>Secret prefilled from URL</span>
            ) : (
              <span style={{ color: "rgba(226,232,240,0.55)" }}>Tip: `/admin-signup?code=...`</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

