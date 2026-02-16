"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminAuthFetch } from "@/lib/authClient";

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/admin";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const email = (emailRef.current?.value ?? "").trim();
      const password = (passwordRef.current?.value ?? "").trim();
      if (!email || !password) throw new Error("Missing credentials");

      const result = await adminAuthFetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }, {
        redirectOnAuthError: false,
      });
      if (!result.ok) {
        console.error("[ADMIN:login:client:error]", {
          status: result.status,
          message: "Login request failed",
        });
        throw new Error(result.status === 401 || result.status === 403 ? "Unauthorized" : "Login failed");
      }
      router.replace(next);
    } catch (err) {
      console.error("[ADMIN:login:client:error]", {
        message: "Login submission failed",
        cause: err instanceof Error ? err.message : "Unknown error",
      });
      setError("Unauthorized");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#070b14", color: "#e2e8f0" }}>
      <div
        style={{
          width: 420,
          maxWidth: "92vw",
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 16,
          padding: 16,
          background: "rgba(2,6,23,0.35)",
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 18 }}>Admin login</div>
        <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          Email + password. Creates a persistent <code style={{ color: "rgba(226,232,240,0.9)" }}>admin_session</code>.
        </div>

        {error ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}

        <form onSubmit={(e) => void login(e)} style={{ marginTop: 12, display: "grid", gap: 10 }}>
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
              placeholder="••••••••"
              autoComplete="current-password"
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

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(34,197,94,0.35)",
              background: "rgba(34,197,94,0.16)",
              color: "rgba(134,239,172,0.95)",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
          <Link href="/admin-signup" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
            Create an Admin Account
          </Link>
          <span style={{ color: "rgba(226,232,240,0.55)" }}>Requires Admin Signup Secret</span>
        </div>
      </div>
    </div>
  );
}

