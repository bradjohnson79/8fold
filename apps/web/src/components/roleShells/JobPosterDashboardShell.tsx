"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

export function JobPosterDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread, inboxHref } = useSupportInboxBadge("job-poster");

  const items = [
    { href: "/dashboard/job-poster", label: "Overview" },
    { href: "/dashboard/job-poster/terms", label: "Terms" },
    { href: "/dashboard/job-poster/jobs", label: "My jobs" },
    { href: "/dashboard/job-poster/post-job", label: "Post a job" },
    { href: "/dashboard/job-poster/messages", label: "Messenger" },
    { href: "/dashboard/job-poster/profile", label: "Profile" },
    { href: "/dashboard/job-poster/payment", label: "Payment Setup" },
    { href: "/dashboard/job-poster/support", label: "Support" },
    { href: inboxHref, label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
  ];

  return (
    <DashboardShell title="Job Poster Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}
