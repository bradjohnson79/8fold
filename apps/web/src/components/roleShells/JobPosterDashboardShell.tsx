"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function JobPosterDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread } = useSupportInboxBadge("job-poster");

  const items = [
    { href: "/dashboard/job-poster", label: "Overview" },
    { href: "/dashboard/job-poster/jobs", label: "My jobs" },
    { href: "/post-job", label: "Post a job" },
    { href: "/dashboard/job-poster/messages", label: "Messages" },
    { href: "/dashboard/job-poster/notifications", label: "Notifications" },
    { href: "/dashboard/job-poster/support", label: "Support" },
    { href: "/dashboard/job-poster/support-inbox", label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
    { href: "/dashboard/job-poster/profile", label: "Profile" },
    { href: "/dashboard/job-poster/payment", label: "Payment Setup" },
  ];

  return (
    <DashboardShell title="Job Poster Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}
