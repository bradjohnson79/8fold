import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { jobAssignments } from "@/db/schema/jobAssignment";
import { jobs } from "@/db/schema/job";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs");
  return parts[idx + 1] ?? "";
}

/**
 * GET /api/admin/jobs/:id
 * Returns a single job with assignment and contractor.
 * Includes scope (job description) and description as alias for scope.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });

    const rows = await db
      .select({
        job: jobs,
        assignment: jobAssignments,
        contractor: contractors,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
      .where(eq(jobs.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const job = r.job as any;
    // Authoritative: return scope as-is (no trim), alias description. Preserve whitespace and line breaks.
    const out = {
      ...job,
      scope: job.scope ?? null,
      description: job.scope ?? "",
      assignment: r.assignment?.id
        ? {
            ...(r.assignment as any),
            contractor: r.contractor?.id ? (r.contractor as any) : null,
          }
        : null,
    };
    return NextResponse.json({ ok: true, data: out });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/:id", { route: "/api/admin/jobs/[id]", userId: auth.userId });
  }
}
