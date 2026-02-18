"use client";

import React from "react";
import { PageHeader, Card } from "@/admin/ui/primitives";
import { AdminColors } from "@/admin/ui/theme";

export default function JobStatusPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Operations"
        title="Job Status"
        subtitle="(Phase 6) This page is being migrated into Rome."
      />
      <Card>
        <div style={{ color: AdminColors.muted, fontSize: 13 }}>
          Not migrated yet.
        </div>
      </Card>
    </main>
  );
}

