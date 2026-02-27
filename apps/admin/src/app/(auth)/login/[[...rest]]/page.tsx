import { ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nextjs";

export default function AdminLoginPage() {
  const hasPublishableKey = Boolean(String(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim());

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#070b14",
        color: "#e2e8f0",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 480, display: "grid", gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: "center" }}>8Fold Admin Login</h1>
        <p style={{ margin: 0, textAlign: "center", opacity: 0.85 }}>Sign in with your admin account credentials.</p>

        {!hasPublishableKey ? (
          <div style={{ border: "1px solid #ef4444", borderRadius: 10, padding: 14, background: "rgba(127,29,29,0.25)" }}>
            Authentication is not configured on this deployment (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` missing).
          </div>
        ) : (
          <>
            <ClerkLoading>
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.25)",
                  borderRadius: 10,
                  padding: 14,
                  background: "rgba(15,23,42,0.55)",
                }}
              >
                Loading secure sign-in...
              </div>
            </ClerkLoading>
            <ClerkLoaded>
              <SignIn
                path="/login"
                routing="path"
                forceRedirectUrl="/"
                fallbackRedirectUrl="/"
                appearance={{
                  elements: {
                    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
                    card: { width: "100%", maxWidth: 460 },
                  },
                }}
              />
            </ClerkLoaded>
          </>
        )}
      </div>
    </div>
  );
}
