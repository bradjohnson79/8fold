/**
 * DISE isolation boundary (Directory Intelligence & Submission Engine).
 *
 * - No dependencies on job lifecycle (jobs/dispatch/completion).
 * - No dependencies on ledger or Stripe/payments.
 * - DB access must target ONLY `directory_engine` tables via `@/db/schema/directoryEngine`.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { regionalContext } from "@/db/schema/directoryEngine";

type GenerateInput = {
  region: string;
  country?: string;
  overwrite?: boolean;
};

// Stub: returns mock context when PERPLEXITY_API_KEY is missing
const MOCK_CONTEXT = {
  keyIndustries: ["Construction", "Home Services", "Trade"],
  topTrades: ["Plumbing", "Electrical", "HVAC"],
  serviceDemand: ["Repairs", "Installations", "Maintenance"],
  populationTraits: ["Suburban", "Homeowner-focused"],
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as GenerateInput;
    const { region, country, overwrite = false } = body;

    if (!region) {
      return NextResponse.json({ ok: false, error: "region required" }, { status: 400 });
    }

    // External provider integration is not wired yet; use deterministic mock context.
    const ctx = MOCK_CONTEXT;

    const [existing] = await db
      .select()
      .from(regionalContext)
      .where(eq(regionalContext.region, region));

    if (existing && !overwrite) {
      return NextResponse.json({
        ok: false,
        error: "Region exists. Set overwrite: true to replace.",
        data: existing,
      }, { status: 409 });
    }

    const payload = {
      region,
      country: country ?? null,
      keyIndustries: ctx.keyIndustries,
      topTrades: ctx.topTrades,
      serviceDemand: ctx.serviceDemand,
      populationTraits: ctx.populationTraits,
      updatedAt: new Date(),
    };

    if (existing) {
      const [row] = await db
        .update(regionalContext)
        .set(payload)
        .where(eq(regionalContext.region, region))
        .returning();
      return NextResponse.json({ ok: true, data: row });
    }

    const [row] = await db.insert(regionalContext).values(payload).returning();
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE regional-context generate error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
