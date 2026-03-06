"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";

export function RouterDashboardShell({ children }: { children: React.ReactNode }) {
  const items = [
    { href: "/dashboard/router", label: "Overview" },
    { href: "/dashboard/router/terms", label: "Terms" },
    { href: "/dashboard/router/profile", label: "Profile" },
    { href: "/dashboard/router/payments", label: "Payments" },
    { href: "/dashboard/router/jobs/available", label: "Available Jobs" },
    { href: "/dashboard/router/jobs/routed", label: "Routed Jobs" },
    { href: "/dashboard/router/notifications", label: "Notifications" },
    { href: "/dashboard/router/support", label: "Support" },
    { href: "/dashboard/router/support-inbox", label: "Support Inbox" },
  ];

  return <DashboardShell title="Router Dashboard" items={items} navMode="sidebar">{children}</DashboardShell>;
}
