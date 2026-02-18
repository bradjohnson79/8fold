"use client";

export function NotAuthorized(props: { role?: string | null }) {
  const role = String(props.role ?? "").trim();

  async function signOut() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // best-effort
    }
    window.location.href = "/login";
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Not authorized</div>
        <div style={{ marginTop: 6, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          Your account is signed in, but does not have ADMIN access in 8Fold.
        </div>
        {role ? (
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
            Current role: <code>{role}</code>
          </div>
        ) : null}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => void signOut()}
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
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

