"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function ContractorDashboardShellV4({ children }: { children: React.ReactNode }) {
  const { hasUnread, inboxHref } = useSupportInboxBadge("contractor");

  const items = [
    { href: "/dashboard/contractor", label: "Overview" },
    { href: "/dashboard/contractor/terms", label: "Terms" },
    { href: "/dashboard/contractor/invites", label: "Invites" },
    { href: "/dashboard/contractor/jobs", label: "Jobs" },
    { href: "/dashboard/contractor/account-status", label: "Account Status" },
    { href: "/dashboard/contractor/messages", label: "Messenger" },
    { href: "/dashboard/contractor/profile", label: "Profile" },
    { href: "/dashboard/contractor/payment", label: "Payment Setup" },
    { href: "/dashboard/contractor/appraisals", label: "2nd Appraisals" },
    { href: "/dashboard/contractor/support", label: "Support" },
    { href: inboxHref, label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
  ];

  return (
    <DashboardShell title="Contractor Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}
