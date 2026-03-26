"use client";

/**
 * @deprecated Legacy contractor shell. Contractors now use ContractorDashboardShellV4 at /dashboard/contractor.
 * This component is no longer rendered; /app/contractor redirects to /dashboard/contractor.
 */
import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function ContractorDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread, inboxHref } = useSupportInboxBadge("contractor");

  const items = [
    { href: "/app/contractor", label: "Overview" },
    { href: "/app/contractor/jobs", label: "Job assignments" },
    { href: "/app/contractor/repeat-requests", label: "Repeat requests" },
    { href: "/app/contractor/messages", label: "Messenger" },
    { href: "/app/contractor/incentives", label: "Incentives" },
    { href: "/app/contractor/support", label: "Support" },
    { href: inboxHref, label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
    { href: "/dashboard/contractor/profile", label: "Profile & Payout" },
  ];

  return (
    <DashboardShell title="Contractor Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}
