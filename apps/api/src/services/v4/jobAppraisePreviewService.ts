import { z } from "zod";

export const V4JobAppraiseBodySchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  description: z.string().min(1, "description is required").max(5000),
  tradeCategory: z.string().min(1, "tradeCategory is required").max(100),
  stateProvince: z.string().min(1, "stateProvince is required").max(50),
  isRegional: z.boolean(),
});

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

export function computeV4JobAppraisal(input: z.infer<typeof V4JobAppraiseBodySchema>) {
  let median = 200;
  if (input.tradeCategory.toLowerCase().includes("plumbing")) median += 50;
  if (input.isRegional) median += 75;

  const low = Math.max(50, roundToNearestFive(median * 0.85));
  const high = roundToNearestFive(median * 1.15);
  const suggestedTotal = roundToNearestFive(median);

  const parts: string[] = [];
  if (input.tradeCategory.toLowerCase().includes("plumbing")) {
    parts.push("Plumbing typically commands a premium.");
  }
  if (input.isRegional) {
    parts.push("Regional scope adds travel and coordination cost.");
  }
  parts.push(`Base estimate for ${input.tradeCategory} in ${input.stateProvince}.`);

  return {
    priceRange: { low, high },
    suggestedTotal,
    rationale: parts.join(" ").slice(0, 100),
    modelUsed: "gpt-5-nano",
    promptVersion: "job-appraisal-v4.0",
  };
}
