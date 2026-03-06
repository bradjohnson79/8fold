"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";

export function ContractorDashboardShellV4({ children }: { children: React.ReactNode }) {
  const items = [
    { href: "/dashboard/contractor", label: "Overview" },
    { href: "/dashboard/contractor/terms", label: "Terms" },
    { href: "/dashboard/contractor/invites", label: "Invites" },
    { href: "/dashboard/contractor/jobs", label: "Jobs" },
    { href: "/dashboard/contractor/account-status", label: "Account Status" },
    { href: "/dashboard/contractor/messages", label: "Messenger" },
    { href: "/dashboard/contractor/notifications", label: "Notifications" },
    { href: "/dashboard/contractor/profile", label: "Profile" },
    { href: "/dashboard/contractor/payment", label: "Payment Setup" },
    { href: "/dashboard/contractor/support", label: "Support" },
    { href: "/dashboard/contractor/support-inbox", label: "Support Inbox" },
  ];

  return (
    <DashboardShell title="Contractor Dashboard" items={items}>
      {children}
    </DashboardShell>
  );
}
