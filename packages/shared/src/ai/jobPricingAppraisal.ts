import { z } from "zod";

/**
 * Required structured output for AI job pricing appraisal (advisory only).
 * Numbers are in whole dollars (no cents).
 */
export const JobPricingAppraisalOutputSchema = z.object({
  suggestedTotal: z.number(),
  currency: z.enum(["USD", "CAD"]),
  confidence: z.enum(["low", "medium", "high"]),
  priceRange: z.object({
    low: z.number(),
    high: z.number()
  }),
  reasoning: z.string(),
  isOutlier: z.boolean()
});

export type JobPricingAppraisalOutput = z.infer<typeof JobPricingAppraisalOutputSchema>;

