import { SignIn } from "@clerk/nextjs";

export default function AdminLoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#070b14", padding: 16 }}>
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
    </div>
  );
}
