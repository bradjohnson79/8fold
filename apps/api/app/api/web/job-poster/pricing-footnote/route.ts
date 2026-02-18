import { NextResponse } from "next/server";
import { z } from "zod";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";

const BodySchema = z.object({
  // Negative means user lowered price below AI baseline.
  deltaDollars: z.number().int().min(-5000).max(5000),
});

function buildFootnote(deltaDollars: number): { message: string; severity: "info" | "caution" } | null {
  if (!Number.isFinite(deltaDollars)) return null;
  if (deltaDollars >= 0) return null;

  const drop = Math.abs(deltaDollars);
  const severity: "info" | "caution" = drop >= 40 ? "caution" : "info";
  const message =
    severity === "caution"
      ? `You lowered the price by $${drop} vs the AI recommendation. Larger reductions can slow routing and reduce contractor interest.`
      : `You lowered the price by $${drop} vs the AI recommendation. Lower prices may slow routing and reduce contractor interest.`;
  return { message, severity };
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;

    let raw: unknown = null;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const fn = buildFootnote(parsed.data.deltaDollars);
    return NextResponse.json({ ok: true, pricingFootnote: fn }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

