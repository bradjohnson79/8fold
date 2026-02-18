"use client";

import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (e) {
      console.error("[ADMIN:logout:client:error]", {
        message: "Logout submission failed",
        cause: e instanceof Error ? e.message : "Unknown error",
      });
      setError("Logout failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {error ? <span style={{ color: "rgba(254,202,202,0.95)", fontSize: 12, fontWeight: 800 }}>{error}</span> : null}
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={loading}
        title="Logout"
        style={{
          fontSize: 12,
          fontWeight: 900,
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid rgba(148,163,184,0.14)",
          color: "rgba(226,232,240,0.9)",
          background: "rgba(2,6,23,0.35)",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Logging out…" : "Logout"}
      </button>
    </div>
  );
}

