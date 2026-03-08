"use client";

import { SupportInbox } from "@/components/support/SupportInbox";

export default function ContractorSupportInboxPage() {
  return (
    <SupportInbox
      basePath="/dashboard/contractor/support"
      newTicketPath="/dashboard/contractor/support"
    />
  );
}
