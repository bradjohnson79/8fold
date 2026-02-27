"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ADMIN_OPERATOR");
  const [tokenCode, setTokenCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const resp = await fetch("/api/admin/auth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, role, tokenCode }),
      });

      if (!resp.ok) {
        const body = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message || "Failed to create admin");
        return;
      }

      setMessage("Admin created. You can sign in now.");
      setTimeout(() => {
        router.replace("/login");
      }, 800);
    } catch {
      setError("Failed to create admin");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", color: "#dbe7ff" }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 420,
          maxWidth: "92vw",
          display: "grid",
          gap: 12,
          padding: 20,
          borderRadius: 14,
          border: "1px solid rgba(148,163,184,0.2)",
          background: "rgba(15,23,42,0.7)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Create Admin</h1>
        <div style={{ fontSize: 12, color: "rgba(219,231,255,0.75)" }}>
          Requires a valid admin creation token.
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={12}
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, height: 42 }}>
            <option value="ADMIN_VIEWER">ADMIN_VIEWER</option>
            <option value="ADMIN_OPERATOR">ADMIN_OPERATOR</option>
            <option value="ADMIN_SUPER">ADMIN_SUPER</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(219,231,255,0.8)" }}>Token Code</span>
          <input
            value={tokenCode}
            onChange={(e) => setTokenCode(e.target.value)}
            type="password"
            required
            style={inputStyle}
          />
        </label>

        {error ? <div style={{ color: "#fecaca", fontSize: 13, fontWeight: 700 }}>{error}</div> : null}
        {message ? <div style={{ color: "#86efac", fontSize: 13, fontWeight: 700 }}>{message}</div> : null}

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
          {submitting ? "Creating..." : "Create admin"}
        </button>

        <div style={{ marginTop: 4 }}>
          <Link href="/login" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
            Back to login
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
