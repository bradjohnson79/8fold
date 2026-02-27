import Link from "next/link";

export default function AdminSignupPage() {
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Admin provisioning moved</div>
        <div style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          Admin account creation is no longer available from this page. Provision users in Clerk and grant admin role in the platform database.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/login" style={{ color: "rgba(56,189,248,0.95)", fontWeight: 900, textDecoration: "none" }}>
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
