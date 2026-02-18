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
import { countryContext } from "@/db/schema/directoryEngine";

type GenerateInput = {
  country: string;
  overwrite?: boolean;
};

const MOCK_CONTEXT = {
  keyIndustries: ["Construction", "Home Services", "Trade", "Manufacturing"],
  workforceTrends: ["Skilled trades shortage", "Aging workforce", "Apprenticeship growth"],
  tradeDemand: ["Repairs", "Installations", "Maintenance", "Renovations"],
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as GenerateInput;
    const { country, overwrite = false } = body;

    if (!country) {
      return NextResponse.json({ ok: false, error: "country required" }, { status: 400 });
    }

    // External provider integration is not wired yet; use deterministic mock context.
    const ctx = MOCK_CONTEXT;

    const [existing] = await db
      .select()
      .from(countryContext)
      .where(eq(countryContext.country, country));

    const payload = {
      country,
      keyIndustries: ctx.keyIndustries,
      workforceTrends: ctx.workforceTrends,
      tradeDemand: ctx.tradeDemand,
      updatedAt: new Date(),
    };

    if (existing && !overwrite) {
      return NextResponse.json(
        { ok: false, error: "Country exists. Set overwrite: true to replace.", data: existing },
        { status: 409 }
      );
    }

    if (existing) {
      const [row] = await db
        .update(countryContext)
        .set(payload)
        .where(eq(countryContext.country, country))
        .returning();
      return NextResponse.json({ ok: true, data: row });
    }

    const [row] = await db.insert(countryContext).values(payload).returning();
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE country-context generate error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
