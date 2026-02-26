/**
 * Shared V4 Job Status vocabulary.
 * Used across invites, assignments, PM, receipts, and future router logic.
 * Prevents ACCEPTED vs ASSIGNED drift, PM_PENDING vs PENDING_PM drift, role-specific status divergence.
 */

/** Invite status */
export const V4_INVITE_STATUS = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type V4InviteStatus = (typeof V4_INVITE_STATUS)[number];

/** Assignment status */
export const V4_ASSIGNMENT_STATUS = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"] as const;
export type V4AssignmentStatus = (typeof V4_ASSIGNMENT_STATUS)[number];

/** P&M request status */
export const V4_PM_REQUEST_STATUS = ["DRAFT", "SENT", "APPROVED", "REJECTED", "SETTLED"] as const;
export type V4PmRequestStatus = (typeof V4_PM_REQUEST_STATUS)[number];

/** Receipt refund decision */
export const V4_RECEIPT_DECISION = ["CREDIT", "REFUND", "NONE"] as const;
export type V4ReceiptDecision = (typeof V4_RECEIPT_DECISION)[number];

/** Unified job timeline status (for display) */
export const V4_JOB_TIMELINE_STATUS = [
  "ROUTED",
  "INVITED",
  "ACCEPTED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "PM_PENDING",
  "PM_APPROVED",
  "PM_SETTLED",
  "CLOSED",
] as const;
export type V4JobTimelineStatus = (typeof V4_JOB_TIMELINE_STATUS)[number];
