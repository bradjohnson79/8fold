"use client";

import React from "react";
import { useParams } from "next/navigation";
import { PageHeader, Card, SecondaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

export default function DisputeDetailPage() {
  const params = useParams<{ disputeId: string }>();
  const disputeId = String((params as any)?.disputeId ?? "");

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader eyebrow="Support" title="Dispute" subtitle={`Dispute: ${disputeId}`} />
      <Card>
        <div style={{ color: AdminColors.muted, fontSize: 13, marginBottom: 12 }}>
          (Phase 6) Dispute detail view not migrated yet.
        </div>
        <SecondaryButton onClick={() => (window.location.href = "/admin/support/disputes")}>Back</SecondaryButton>
      </Card>
    </main>
  );
}

