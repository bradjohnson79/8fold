/**
 * DISE isolation boundary (Directory Intelligence & Submission Engine).
 *
 * - No dependencies on job lifecycle (jobs/dispatch/completion).
 * - No dependencies on ledger or Stripe/payments.
 * - DB access must target ONLY `directory_engine` tables via `@/db/schema/directoryEngine`.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { backlinks } from "@/db/schema/directoryEngine";
import { directories } from "@/db/schema/directoryEngine";
import { submissions } from "@/db/schema/directoryEngine";

export async function GET() {
  try {
    const [totalDirs, pendingReview, submissionsReady, approvedBacklinks] = await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(directories),
      db
        .select({ c: sql<number>`count(*)` })
        .from(directories)
        .where(eq(directories.status, "NEW")),
      db
        .select({ c: sql<number>`count(*)` })
        .from(submissions)
        .where(eq(submissions.status, "READY")),
      db
        .select({ c: sql<number>`count(*)` })
        .from(backlinks)
        .where(eq(backlinks.verified, true)),
    ]);

    const toNum = (r: { c: unknown }[]) => Number((r[0] as { c: number })?.c ?? 0);

    return NextResponse.json({
      ok: true,
      data: {
        totalDirectories: toNum(totalDirs),
        pendingReview: toNum(pendingReview),
        submissionsReady: toNum(submissionsReady),
        approvedBacklinks: toNum(approvedBacklinks),
      },
    });
  } catch (err) {
    console.error("DISE dashboard error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
