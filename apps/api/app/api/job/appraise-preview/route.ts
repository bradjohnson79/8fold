import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  description: z.string().min(1, "description is required").max(5000),
  tradeCategory: z.string().min(1, "tradeCategory is required").max(100),
  stateProvince: z.string().min(1, "stateProvince is required").max(50),
  isRegional: z.boolean(),
});

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Deterministic mock appraisal for job preview.
 * No DB reads/writes. No AI calls.
 */
function computeMockAppraisal(input: z.infer<typeof BodySchema>) {
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
  const rationale = parts.join(" ").slice(0, 100);

  return {
    priceRange: { low, high },
    suggestedTotal,
    rationale,
    modelUsed: "gpt-5-nano",
    promptVersion: "job-appraisal-v4.0",
  };
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Invalid request body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const result = computeMockAppraisal(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Appraisal preview failed." },
      { status: 500 }
    );
  }
}
