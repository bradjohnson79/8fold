export const NOTIFICATION_ROLES = ["CONTRACTOR", "JOB_POSTER", "ROUTER", "ADMIN"] as const;
export type NotificationRole = (typeof NOTIFICATION_ROLES)[number];

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_TYPES = [
  // Contractor
  "NEW_JOB_INVITE",
  "INVITE_EXPIRED",
  "JOB_ASSIGNED",
  "POSTER_ACCEPTED",
  "APPOINTMENT_BOOKED",
  "RESCHEDULE_REQUEST",
  "JOB_CANCELLED_BY_CUSTOMER",
  "BREACH_PENALTY_APPLIED",
  "SUSPENSION_APPLIED",
  "PAYMENT_RELEASED",
  // Job poster
  "CONTRACTOR_ACCEPTED",
  "ASSIGNED_CONTRACTOR_EXPIRED",
  "RESCHEDULE_ACCEPTED",
  "CONTRACTOR_CANCELLED",
  "JOB_PUBLISHED",
  "REFUND_PROCESSED",
  "ROUTING_EXPIRED_NO_ACCEPT",
  "MESSAGE_RECEIVED",
  "JOB_REJECTED",
  // Router
  "JOB_ROUTED",
  "ROUTING_WINDOW_EXPIRED",
  "JOB_RESET_TO_QUEUE",
  "ROUTER_COMPENSATION_PROCESSED",
  // Admin
  "JOB_CANCELLED_WITHIN_8H",
  "CONTRACTOR_SUSPENDED",
  "PAYMENT_EXCEPTION",
  "DISPUTE_OPENED",
  "HIGH_VALUE_JOB_CANCELLED",
  "SYSTEM_ERROR_EVENT",
  // Existing live/system compatibility
  "JOB_STARTED",
  "CONTRACTOR_COMPLETED_JOB",
  "FUNDS_RELEASED",
  "NEW_MESSAGE",
  "JOB_REFUNDED",
  "PAYMENT_RECEIVED",
  "ROUTE_INVITE",
  "SYSTEM_ALERT",
  // Support
  "NEW_SUPPORT_TICKET",
  "SUPPORT_REPLY",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const TYPE_SET = new Set<string>(NOTIFICATION_TYPES);
const ROLE_SET = new Set<string>(NOTIFICATION_ROLES);
const PRIORITY_SET = new Set<string>(NOTIFICATION_PRIORITIES);

export function normalizeNotificationType(raw: string | null | undefined): NotificationType {
  const t = String(raw ?? "").trim().toUpperCase();
  if (TYPE_SET.has(t)) return t as NotificationType;
  return "SYSTEM_ALERT";
}

export function normalizeNotificationRole(raw: string | null | undefined): NotificationRole {
  const r = String(raw ?? "").trim().toUpperCase();
  if (ROLE_SET.has(r)) return r as NotificationRole;
  return "ADMIN";
}

export function normalizeNotificationPriority(raw: string | null | undefined): NotificationPriority {
  const p = String(raw ?? "").trim().toUpperCase();
  if (PRIORITY_SET.has(p)) return p as NotificationPriority;
  return "NORMAL";
}
