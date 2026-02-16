import React from "react";

export default async function ContractorDispatchOfferPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  // Minimal contractor-facing surface. Token-based decision remains server-enforced.
  // Full UI wiring is intentionally minimal and deterministic (no auth required).
  const { token } = await params;
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: 0 }}>Job Offer</h2>
      <p style={{ color: "#475569" }}>
        Funds are held by 8Fold and paid after job completion.
      </p>
      <p style={{ color: "#475569" }}>
        <strong>Contractors are paid the next business day after job completion.</strong>
      </p>
      <p style={{ color: "#94a3b8" }}>
        Token: {token.slice(0, 6)}… (use this token with the accept/decline API)
      </p>
      <p style={{ color: "#475569" }}>
        Accept/decline UI can be layered on top of{" "}
        <code>/api/contractor/dispatch/respond</code> without changing payout or routing logic.
      </p>
    </main>
  );
}

