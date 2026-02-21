"use client";

import React from "react";
import { DashboardShell } from "../DashboardShell";
import { useSupportInboxBadge } from "./useSupportInboxBadge";

import { postAJobPath } from "@/lib/jobWizardV3";

export function JobPosterDashboardShell({ children }: { children: React.ReactNode }) {
  const { hasUnread } = useSupportInboxBadge("job-poster");

  const items = [
    { href: "/app/job-poster", label: "Overview" },
    { href: "/app/job-poster/jobs", label: "My jobs" },
    { href: postAJobPath, label: "Post a job" },
    { href: "/app/job-poster/messages", label: "Messages" },
    { href: "/app/job-poster/support", label: "Support" },
    { href: "/app/job-poster/support/inbox", label: "Support Inbox", badge: hasUnread ? ({ kind: "dot" as const } as const) : undefined },
    { href: "/app/job-poster/profile", label: "Profile" },
  ];

  return (
    <DashboardShell title="Job Poster Dashboard" items={items} extraUnreadCount={hasUnread ? 1 : 0}>
      {children}
    </DashboardShell>
  );
}

