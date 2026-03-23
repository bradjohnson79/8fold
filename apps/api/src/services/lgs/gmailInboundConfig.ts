export const LGS_GMAIL_INBOUND_PIPELINES = {
  contractor: ["partners@8fold.app", "support@8fold.app"],
  jobs: ["hello@8fold.app", "info@8fold.app"],
} as const;

export type LgsInboundPipeline = keyof typeof LGS_GMAIL_INBOUND_PIPELINES;

const MAILBOX_TO_PIPELINE = new Map<string, LgsInboundPipeline>(
  Object.entries(LGS_GMAIL_INBOUND_PIPELINES).flatMap(([pipeline, mailboxes]) =>
    mailboxes.map((mailbox) => [mailbox.trim().toLowerCase(), pipeline as LgsInboundPipeline] as const)
  )
);

export function getTrackedInboundMailboxes(): string[] {
  return Array.from(MAILBOX_TO_PIPELINE.keys());
}

export function getPipelineForInboundMailbox(mailbox: string): LgsInboundPipeline | null {
  return MAILBOX_TO_PIPELINE.get(mailbox.trim().toLowerCase()) ?? null;
}

export function isTrackedInboundMailbox(mailbox: string | null | undefined): boolean {
  if (!mailbox) return false;
  return MAILBOX_TO_PIPELINE.has(mailbox.trim().toLowerCase());
}
