import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobAssignments, jobs } from "../../db/schema";
import { optionalUser, type ApiAuthedUser } from "@/src/auth/rbac";
import { getApprovedContractorForUserId } from "@/src/services/contractorIdentity";
import { randomUUID } from "crypto";

export type PMRouteRole = "CONTRACTOR" | "JOB_POSTER";

export type PMRouteContext = {
  jobId: string;
  job: { id: string; status: string; jobPosterUserId: string };
  user: ApiAuthedUser;
  contractorId: string | null;
  traceId: string;
};

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const jobIdx = parts.indexOf("job");
  if (jobIdx >= 0 && parts[jobIdx + 1]) return parts[jobIdx + 1];
  return "";
}

/**
 * P&M is only active when Job.status === IN_PROGRESS (per spec).
 */
function isJobInProgress(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toUpperCase() === "IN_PROGRESS";
}

/**
 * Load job + assignment for PM route validation.
 */
export async function loadPmRouteContext(
  req: Request,
  requiredRole: PMRouteRole
): Promise<{ ok: true; ctx: PMRouteContext } | { ok: false; response: Response }> {
  const u = await optionalUser(req);
  if (!u) {
    return { ok: false, response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }

  const jobId = getJobIdFromUrl(req);
  if (!jobId) {
    return { ok: false, response: new Response(JSON.stringify({ error: "Missing jobId" }), { status: 400 }) };
  }

  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      archived: jobs.archived,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = jobRows[0] ?? null;
  if (!job) {
    return { ok: false, response: new Response(JSON.stringify({ error: "Not found" }), { status: 404 }) };
  }
  if (job.archived) {
    return { ok: false, response: new Response(JSON.stringify({ error: "Job archived" }), { status: 400 }) };
  }

  if (!isJobInProgress(job.status)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Parts & Materials is only available when the job is in progress." }),
        { status: 400 }
      ),
    };
  }

  let contractorId: string | null = null;
  const assignRows = await db
    .select({ contractorId: jobAssignments.contractorId })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.status, "ASSIGNED")))
    .limit(1);
  if (assignRows[0]) contractorId = assignRows[0].contractorId;

  if (requiredRole === "CONTRACTOR") {
    const c = await getApprovedContractorForUserId(db, u.userId);
    if (c.kind !== "ok") {
      return { ok: false, response: new Response(JSON.stringify({ error: "Contractor not found" }), { status: 403 }) };
    }
    if (!contractorId || String(contractorId) !== String(c.contractor.id)) {
      return { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
    }
    contractorId = c.contractor.id;
  }

  if (requiredRole === "JOB_POSTER") {
    if (String(job.jobPosterUserId) !== String(u.userId)) {
      return { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
    }
  }

  const traceId = req.headers.get("x-request-id") ?? randomUUID();
  return {
    ok: true,
    ctx: {
      jobId,
      job: {
        id: job.id,
        status: job.status,
        jobPosterUserId: String(job.jobPosterUserId ?? ""),
      },
      user: u,
      contractorId,
      traceId,
    },
  };
}

/**
 * Allow either Contractor or Job Poster (for listing PM requests).
 */
export async function loadPmRouteContextAny(
  req: Request
): Promise<{ ok: true; ctx: PMRouteContext } | { ok: false; response: Response }> {
  const contractor = await loadPmRouteContext(req, "CONTRACTOR");
  if (contractor.ok) return contractor;
  const poster = await loadPmRouteContext(req, "JOB_POSTER");
  return poster;
}
