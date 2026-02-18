"use client";

import React from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { RouterWizardGate } from "./RouterWizardGate";

export function RouterDashboardLayoutClient(props: { children: React.ReactNode }) {
  const items = [
    { href: "/app/router", label: "Overview" },
    { href: "/app/router/open-jobs", label: "Open jobs in region" },
    { href: "/app/router/queue", label: "Routing queue" },
    { href: "/app/router/earnings", label: "Earnings overview" },
    { href: "/app/router/incentives", label: "Incentives" },
    { href: "/app/router/rewards", label: "Referral Rewards" },
    { href: "/app/router/support", label: "Support" },
    { href: "/app/router/support/inbox", label: "Support Inbox" },
    { href: "/app/router/profile", label: "Profile" },
  ];

  return (
    <DashboardShell title="Router Dashboard" items={items}>
      <RouterWizardGate>{props.children}</RouterWizardGate>
    </DashboardShell>
  );
}

