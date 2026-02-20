"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function ContractorDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread } = useSupportInboxBadge("contractor");

  const items = [
    { href: "/app/contractor", label: "Overview" },
    { href: "/app/contractor/jobs", label: "Job assignments" },
    { href: "/app/contractor/repeat-requests", label: "Repeat requests" },
    { href: "/app/contractor/messages", label: "Messages" },
    { href: "/app/contractor/incentives", label: "Incentives" },
    { href: "/app/contractor/support", label: "Support" },
    { href: "/app/contractor/support/inbox", label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
    { href: "/app/contractor/profile", label: "Profile & Payout" },
  ];

  return (
    <DashboardShell title="Contractor Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}

