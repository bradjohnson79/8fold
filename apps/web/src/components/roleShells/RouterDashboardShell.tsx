"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function RouterDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread } = useSupportInboxBadge("router");

  const items = [
    { href: "/app/router", label: "Overview" },
    { href: "/app/router/open-jobs", label: "Open jobs in region" },
    { href: "/app/router/queue", label: "Routing queue" },
    { href: "/app/router/earnings", label: "Earnings overview" },
    { href: "/app/router/incentives", label: "Incentives" },
    { href: "/app/router/rewards", label: "Rewards" },
    { href: "/app/router/support", label: "Support" },
    { href: "/app/router/support/inbox", label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
    { href: "/app/router/profile", label: "Profile" },
  ];

  return (
    <DashboardShell title="Router Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}

