/**
 * DISE isolation boundary (Directory Intelligence & Submission Engine).
 *
 * - No dependencies on job lifecycle (jobs/dispatch/completion).
 * - No dependencies on ledger or Stripe/payments.
 * - DB access must target ONLY `directory_engine` tables via `@/db/schema/directoryEngine`.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { directories } from "@/db/schema/directoryEngine";
import { submissions } from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const directoryId = searchParams.get("directoryId");

    const conditions = [];
    if (status) conditions.push(eq(submissions.status, status));
    if (directoryId) conditions.push(eq(submissions.directoryId, directoryId));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        submission: submissions,
        directory: directories,
      })
      .from(submissions)
      .innerJoin(directories, eq(submissions.directoryId, directories.id));
    const rows = whereClause
      ? await baseQuery.where(whereClause).orderBy(submissions.createdAt)
      : await baseQuery.orderBy(submissions.createdAt);
    const data = rows.map((r) => ({ ...r.submission, directory: r.directory }));
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("DISE submissions list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
