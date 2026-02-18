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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");

    if (region) {
      const [row] = await db
        .select()
        .from(regionalContext)
        .where(eq(regionalContext.region, region));
      return NextResponse.json({ ok: true, data: row ?? null });
    }

    const rows = await db.select().from(regionalContext);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("DISE regional-context list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
