"use client";

import React from "react";
import { PageHeader, Card, SecondaryButton } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";
import { useParams } from "next/navigation";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String((params as any)?.id ?? "");

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader eyebrow="Operations" title="Job Detail" subtitle={`Job: ${id}`} />
      <Card>
        <div style={{ color: AdminColors.muted, fontSize: 13, marginBottom: 12 }}>
          (Phase 6) Detail view not migrated yet.
        </div>
        <SecondaryButton onClick={() => (window.location.href = "/admin/jobs")}>Back to jobs</SecondaryButton>
      </Card>
    </main>
  );
}

