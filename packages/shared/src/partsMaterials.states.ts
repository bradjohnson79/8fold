import { z } from "zod";

/**
 * P&M (Parts & Materials) Sub-Escrow state machine.
 * All transitions must be validated server-side against PMAllowedTransitions.
 */

export const PMStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "AMENDMENT_REQUESTED",
  "APPROVED",
  "PAYMENT_PENDING",
  "FUNDED",
  "RECEIPTS_SUBMITTED",
  "VERIFIED",
  "RELEASED",
  "CLOSED",
  "REJECTED",
]);
export type PMStatus = z.infer<typeof PMStatusSchema>;

/**
 * Allowed state transitions. Backend must validate every transition against this map.
 * No direct status mutation allowed.
 */
export const PMAllowedTransitions: Readonly<
  Record<PMStatus, readonly PMStatus[]>
> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "AMENDMENT_REQUESTED", "REJECTED"],
  AMENDMENT_REQUESTED: ["DRAFT", "SUBMITTED"],
  APPROVED: ["PAYMENT_PENDING"],
  PAYMENT_PENDING: ["FUNDED"],
  FUNDED: ["RECEIPTS_SUBMITTED"],
  RECEIPTS_SUBMITTED: ["VERIFIED"],
  VERIFIED: ["RELEASED"],
  RELEASED: ["CLOSED"],
  CLOSED: [],
  REJECTED: [],
} as const;
