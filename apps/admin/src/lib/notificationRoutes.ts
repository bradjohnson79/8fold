export type NotificationForRoute = {
  type: string;
  entityId: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Maps notification type to admin destination.
 * Uses metadata.entityId / metadata.jobId / metadata.disputeId when available.
 */
export function getNotificationRoute(notification: NotificationForRoute): string {
  const meta = notification.metadata ?? {};
  const entityId = notification.entityId ?? (meta.entityId as string | undefined);
  const jobId = (meta.jobId as string | undefined) ?? entityId;
  const disputeId = meta.disputeId as string | undefined;
  const ticketId = meta.ticketId as string | undefined;

  switch (notification.type) {
    case "NEW_JOB_INVITE":
    case "CONTRACTOR_ACCEPTED":
    case "JOB_ROUTED":
    case "JOB_ASSIGNED":
    case "JOB_STARTED":
    case "CONTRACTOR_COMPLETED_JOB":
    case "FUNDS_RELEASED":
    case "JOB_REFUNDED":
    case "JOB_CANCELLED_BY_CUSTOMER":
    case "CONTRACTOR_CANCELLED":
    case "ASSIGNED_CONTRACTOR_EXPIRED":
    case "ROUTING_EXPIRED_NO_ACCEPT":
      if (jobId) return `/jobs/${jobId}`;
      return "/jobs";

    case "NEW_SUPPORT_TICKET":
    case "SUPPORT_REPLY":
      if (ticketId) return `/support/${ticketId}`;
      return "/support";

    case "DISPUTE_OPENED":
      if (disputeId) return `/disputes/${disputeId}`;
      if (ticketId) return `/support/${ticketId}`;
      return "/disputes";

    case "PAYMENT_RELEASED":
    case "PAYMENT_EXCEPTION":
    case "PAYMENT_RECEIVED":
      return "/payouts";

    case "SYSTEM_ALERT":
    case "SYSTEM_ERROR_EVENT":
      return "/";

    default:
      return "/notifications";
  }
}
