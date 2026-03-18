"use client";

export default function ForbiddenPage() {
  async function handleLogout() {
    await fetch("/api/lgs/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", color: "#dbe7ff" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0 }}>403</h1>
        <p style={{ fontSize: 16, color: "rgba(219,231,255,0.7)", marginTop: 8 }}>Not authorized to access LGS.</p>
        <button
          onClick={handleLogout}
          style={{
            marginTop: 16,
            border: 0,
            borderRadius: 10,
            padding: "10px 20px",
            fontWeight: 800,
            cursor: "pointer",
            background: "#38bdf8",
            color: "#04101f",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
