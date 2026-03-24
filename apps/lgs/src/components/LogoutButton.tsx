"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        border: 0,
        background: "transparent",
        color: "#94a3b8",
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: 600,
        padding: "0.4rem 0.6rem",
      }}
    >
      Sign out
    </button>
  );
}
