"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function RouterDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread, inboxHref } = useSupportInboxBadge("router");

  const items = [
    { href: "/dashboard/router", label: "Overview" },
    { href: "/dashboard/router/terms", label: "Terms" },
    { href: "/dashboard/router/profile", label: "Profile" },
    { href: "/dashboard/router/payments", label: "Payments" },
    { href: "/dashboard/router/jobs/available", label: "Available Jobs" },
    { href: "/dashboard/router/jobs/routed", label: "Routed Jobs" },
    { href: "/dashboard/router/support", label: "Support" },
    { href: inboxHref, label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
  ];

  return <DashboardShell title="Router Dashboard" items={items} navMode="sidebar" extraUnreadCount={hasUnread ? 1 : 0}>{children}</DashboardShell>;
}
