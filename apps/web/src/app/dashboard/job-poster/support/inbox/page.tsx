"use client";

import { SupportInbox } from "@/components/support/SupportInbox";

export default function JobPosterSupportInboxPage() {
  return (
    <SupportInbox
      basePath="/dashboard/job-poster/support"
      newTicketPath="/dashboard/job-poster/support"
    />
  );
}
