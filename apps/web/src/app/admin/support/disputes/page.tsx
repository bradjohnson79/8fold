"use client";

import React from "react";
import { PageHeader, Card, SecondaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

export default function SupportDisputesPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader eyebrow="Support" title="Disputes" subtitle="(Phase 6) Disputes UI migration pending." />
      <Card>
        <div style={{ color: AdminColors.muted, fontSize: 13, marginBottom: 12 }}>Not migrated yet.</div>
        <SecondaryButton onClick={() => (window.location.href = "/admin/support")}>Back to inbox</SecondaryButton>
      </Card>
    </main>
  );
}

