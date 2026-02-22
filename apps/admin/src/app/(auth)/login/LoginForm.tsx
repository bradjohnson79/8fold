/**
 * Plain HTML form — no fetch, no JS redirect.
 * Browser submits to /api/admin/login, receives 302 + Set-Cookie, follows redirect.
 */
import Link from "next/link";

const backHref = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "").trim() || "/";

const inputStyle = {
  marginTop: 6,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(2,6,23,0.25)",
  color: "rgba(226,232,240,0.95)",
  outline: "none",
} as const;

export function LoginForm({ error, next = "/" }: { error: boolean; next?: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#070b14", color: "#e2e8f0" }}>
      <form
        method="POST"
        action="/api/admin/login"
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

        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "rgba(226,232,240,0.7)", fontWeight: 900 }}>
            Email
          </label>
          <input name="email" type="email" required autoComplete="email" placeholder="admin@example.com" style={inputStyle} />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "rgba(226,232,240,0.7)", fontWeight: 900 }}>
            Password
          </label>
          <input name="password" type="password" required autoComplete="current-password" style={inputStyle} />
        </div>

        {error ? (
          <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontSize: 13, fontWeight: 900 }}>
            Invalid email or password
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(56,189,248,0.35)",
              background: "rgba(56,189,248,0.12)",
              color: "rgba(125,211,252,0.95)",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            Sign in
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
