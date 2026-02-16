import { z } from "zod";
import { TradeCategorySchema } from "./trades";

const NonEmptyTrimmedString = z.string().trim().min(1);

export const JobDraftItemSchema = z.object({
  category: NonEmptyTrimmedString,
  description: NonEmptyTrimmedString,
  quantity: z.number().int().min(1),
  notes: z.string().trim().optional(),
});
export type JobDraftItem = z.infer<typeof JobDraftItemSchema>;

export const JobDraftAddressSchema = z.object({
  street: NonEmptyTrimmedString,
  city: NonEmptyTrimmedString,
  provinceOrState: NonEmptyTrimmedString,
  country: z.enum(["US", "CA"]),
  postalCode: z.string().trim().optional(),
});
export type JobDraftAddress = z.infer<typeof JobDraftAddressSchema>;

export const JobDraftGeoSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});
export type JobDraftGeo = z.infer<typeof JobDraftGeoSchema>;

export const JobPostingInputSchema = z.object({
  jobTitle: z.string().trim().min(5, "Please enter at least 5 characters"),
  scope: z.string().trim().min(20, "Please enter at least 20 characters"),
  tradeCategory: TradeCategorySchema,
  jobType: z.enum(["urban", "regional"]),
  timeWindow: z.string().trim().optional(),
  address: JobDraftAddressSchema,
  geo: JobDraftGeoSchema.optional(),
  items: z.array(JobDraftItemSchema).min(1),
  photoUrls: z.array(z.string().url()).optional(),
  jobId: z.string().trim().optional(),
});
export type JobPostingInput = z.infer<typeof JobPostingInputSchema>;

export const PriceAppraisalResponseSchema = z.object({
  priceMedianCents: z.number().int().positive(),
  allowedDeltaCents: z.number().int().nonnegative(),
  reasoning: z.string(),
});
export type PriceAppraisalResponse = z.infer<typeof PriceAppraisalResponseSchema>;

export const PriceAdjustmentSchema = z.object({
  selectedPriceCents: z.number().int().positive(),
});
export type PriceAdjustment = z.infer<typeof PriceAdjustmentSchema>;
