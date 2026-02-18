"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Card, PrimaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

export default function LoginPage() {
  // Next.js requires `useSearchParams()` to be wrapped in a Suspense boundary.
  return (
    <React.Suspense
      fallback={
        <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
          <PageHeader eyebrow="Admin" title="Login" subtitle="Loading…" />
          <Card>
            <div style={{ color: AdminColors.muted, fontSize: 12 }}>Loading…</div>
          </Card>
        </main>
      }
    >
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnBackUrl = params.get("returnBackUrl") ?? "/admin";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        setError("Invalid email or password.");
        return;
      }
      router.replace(returnBackUrl);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Admin"
        title="Login"
        subtitle="Email/password login (DB-backed). Session is stored in an httpOnly cookie."
      />

      <Card>
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            placeholder="admin@example.com"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${AdminColors.border}`,
              background: AdminColors.card,
              color: AdminColors.text,
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${AdminColors.border}`,
              background: AdminColors.card,
              color: AdminColors.text,
              marginBottom: 12,
            }}
          />

          {error ? <div style={{ color: AdminColors.danger, marginBottom: 10 }}>{error}</div> : null}

          <PrimaryButton type="submit" disabled={submitting || !email.trim() || !password}>
            {submitting ? "Signing in…" : "Sign in"}
          </PrimaryButton>
        </form>
      </Card>
    </main>
  );
}

