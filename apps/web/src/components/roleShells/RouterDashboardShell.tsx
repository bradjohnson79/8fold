"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";

export function RouterDashboardShell({ children }: { children: React.ReactNode }) {
  const items = [
    { href: "/dashboard/router", label: "Overview" },
    { href: "/dashboard/router/jobs/available", label: "Available Jobs" },
    { href: "/dashboard/router/jobs/routed", label: "Routed Jobs" },
    { href: "/dashboard/router/messages", label: "Messages" },
    { href: "/dashboard/router/profile", label: "Profile" },
    { href: "/dashboard/router/support", label: "Support" },
  ];

  return <DashboardShell title="Router Dashboard" items={items} navMode="sidebar">{children}</DashboardShell>;
}
