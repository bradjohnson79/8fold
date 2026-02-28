"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        setError("Invalid credentials");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Invalid credentials");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", color: "#dbe7ff" }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          maxWidth: "92vw",
          display: "grid",
          gap: 12,
          padding: 20,
          borderRadius: 14,
          border: "1px solid rgba(148,163,184,0.2)",
          background: "rgba(15,23,42,0.7)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Admin Login</h1>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>

        {error ? <div style={{ color: "#fecaca", fontSize: 13, fontWeight: 700 }}>{error}</div> : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 4,
            border: 0,
            borderRadius: 10,
            padding: "10px 12px",
            fontWeight: 800,
            cursor: submitting ? "default" : "pointer",
            background: "#38bdf8",
            color: "#04101f",
          }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <div style={{ marginTop: 4 }}>
          <Link href="/admin-signup" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
            Create admin with token
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(2,6,23,0.5)",
  color: "#e2e8f0",
  padding: "0 10px",
};
