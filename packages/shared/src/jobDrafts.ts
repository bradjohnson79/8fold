import { z } from "zod";
import { TradeCategorySchema } from "./trades";

export const JobDraftStatusSchema = z.enum([
  "DRAFT",
  "APPRAISING",
  "PRICED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
  "IN_REVIEW",
  "NEEDS_CLARIFICATION",
  "REJECTED",
  "APPROVED"
]);
export type JobDraftStatus = z.infer<typeof JobDraftStatusSchema>;

const NonEmptyTrimmedString = z.string().trim().min(1);

export const JobDraftCreateInputSchema = z.object({
  title: NonEmptyTrimmedString,
  scope: NonEmptyTrimmedString,
  region: NonEmptyTrimmedString,
  serviceType: NonEmptyTrimmedString,
  tradeCategory: TradeCategorySchema,
  jobType: z.enum(["urban", "regional"]),
  laborTotalCents: z.number().int().nonnegative(),
  materialsTotalCents: z.number().int().nonnegative().optional().default(0),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
  timeWindow: z.string().trim().min(1).optional(),
  notesInternal: z.string().trim().min(1).optional()
});
export type JobDraftCreateInput = z.infer<typeof JobDraftCreateInputSchema>;

export const JobDraftUpdateInputSchema = JobDraftCreateInputSchema.partial().omit({
  // status is changed via explicit transition endpoints only
});
export type JobDraftUpdateInput = z.infer<typeof JobDraftUpdateInputSchema>;

export const JobDraftListQuerySchema = z.object({
  status: JobDraftStatusSchema.optional(),
  q: z.string().trim().optional()
});
export type JobDraftListQuery = z.infer<typeof JobDraftListQuerySchema>;

export const AdminDecisionInputSchema = z.object({
  reason: z.string().trim().min(1).optional()
});
export type AdminDecisionInput = z.infer<typeof AdminDecisionInputSchema>;

