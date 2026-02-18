"use client";

import React from "react";
import { useParams } from "next/navigation";
import { PageHeader, Card, SecondaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

export default function TicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = String((params as any)?.ticketId ?? "");

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader eyebrow="Support" title="Ticket" subtitle={`Ticket: ${ticketId}`} />
      <Card>
        <div style={{ color: AdminColors.muted, fontSize: 13, marginBottom: 12 }}>
          (Phase 6) Ticket detail UI not migrated yet.
        </div>
        <SecondaryButton onClick={() => (window.location.href = "/admin/support")}>Back</SecondaryButton>
      </Card>
    </main>
  );
}

