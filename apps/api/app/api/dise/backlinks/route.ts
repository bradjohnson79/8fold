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
import { backlinks } from "@/db/schema/directoryEngine";
import { directories } from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const verified = searchParams.get("verified");

    const whereClause =
      verified === "true"
        ? eq(backlinks.verified, true)
        : verified === "false"
          ? eq(backlinks.verified, false)
          : undefined;

    const baseQuery = db
      .select({
        backlink: backlinks,
        directory: directories,
      })
      .from(backlinks)
      .innerJoin(directories, eq(backlinks.directoryId, directories.id));
    const rows = whereClause
      ? await baseQuery.where(whereClause).orderBy(backlinks.createdAt)
      : await baseQuery.orderBy(backlinks.createdAt);
    const data = rows.map((r) => ({ ...r.backlink, directory: r.directory }));
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("DISE backlinks list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
