"use client";

import Link from "next/link";
import { use } from "react";
import { SupportTicketThread } from "@/components/support/SupportTicketThread";

export default function ContractorSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/contractor/support/inbox"
          className="text-sm font-medium text-emerald-600 hover:underline"
        >
          ← Back to Inbox
        </Link>
      </div>
      <SupportTicketThread ticketId={ticketId} />
    </div>
  );
}
