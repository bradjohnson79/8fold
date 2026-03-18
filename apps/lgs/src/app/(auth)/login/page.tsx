"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LgsLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/lgs/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!resp.ok) {
        setError("Invalid password");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Login failed — check your connection");
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
          gap: 16,
          padding: 28,
          borderRadius: 14,
          border: "1px solid rgba(148,163,184,0.2)",
          background: "rgba(15,23,42,0.7)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>LGS</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(219,231,255,0.6)" }}>
            Lead Generation System — internal access
          </p>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoFocus
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
            border: 0,
            borderRadius: 10,
            padding: "11px 12px",
            fontWeight: 800,
            fontSize: 15,
            cursor: submitting ? "default" : "pointer",
            background: submitting ? "rgba(56,189,248,0.5)" : "#38bdf8",
            color: "#04101f",
          }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(2,6,23,0.5)",
  color: "#e2e8f0",
  padding: "0 12px",
  fontSize: 15,
};
