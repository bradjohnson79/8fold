import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { adminRouteJobToContractors } from "@/src/services/v4/routerStage2ContractorSelectionService";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["OPEN_FOR_ROUTING", "APPRAISAL_PENDING"]);

const RouteBodySchema = z.object({
  contractorIds: z.array(z.string().trim().min(1)).min(1).max(5),
  confirmOverride: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id: jobId } = await ctx.params;

  let body: z.infer<typeof RouteBodySchema>;
  try {
    const raw = await req.json();
    const parsed = RouteBodySchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "ADMIN_ROUTE_INVALID_BODY", "Invalid payload. Provide contractorIds (1–5 items).");
    }
    body = parsed.data;
  } catch {
    return err(400, "ADMIN_ROUTE_INVALID_JSON", "Invalid JSON body");
  }

  // Pre-flight: check job status and existing routing activity
  const jobRows = await db
    .select({
      status: jobs.status,
      routingStatus: jobs.routing_status,
      failsafeRouting: jobs.failsafe_routing,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0] ?? null;
  if (!job) return err(404, "ADMIN_ROUTE_JOB_NOT_FOUND", "Job not found");

  if (!ALLOWED_STATUSES.has(String(job.status))) {
    return err(
      409,
      "ADMIN_ROUTE_WRONG_STATUS",
      `Admin routing requires job status OPEN_FOR_ROUTING or APPRAISAL_PENDING (current: ${job.status})`,
    );
  }

  // If invites were already sent and override not confirmed, reject with a prompt
  const hasExistingInvites = String(job.routingStatus) === "INVITES_SENT" || job.failsafeRouting;
  if (hasExistingInvites && !body.confirmOverride) {
    return err(
      409,
      "ADMIN_ROUTE_CONFIRM_OVERRIDE_REQUIRED",
      "This job already has routing activity. Set confirmOverride: true to proceed.",
    );
  }

  try {
    const result = await adminRouteJobToContractors(
      authed.adminId,
      authed.email,
      jobId,
      body.contractorIds,
    );

    if (result.kind === "not_found") return err(404, "ADMIN_ROUTE_JOB_NOT_FOUND", "Job not found");
    if (result.kind === "job_not_available") {
      return err(409, "ADMIN_ROUTE_JOB_NOT_AVAILABLE", "Job is not available for routing");
    }
    if (result.kind === "missing_job_coords") {
      return err(409, "ADMIN_ROUTE_MISSING_COORDS", "Job is missing coordinates required for contractor matching");
    }
    if (result.kind === "too_many") {
      return err(400, "ADMIN_ROUTE_TOO_MANY", "Maximum 5 contractors per routing action");
    }
    if (result.kind === "contractor_not_eligible") {
      return err(400, "ADMIN_ROUTE_CONTRACTOR_NOT_ELIGIBLE", "One or more selected contractors are not eligible for this job");
    }

    return ok({ created: result.created, jobId, contractorIds: body.contractorIds });
  } catch (e) {
    console.error("[ADMIN_V4_ROUTE_JOB_ERROR]", {
      jobId,
      adminId: authed.adminId,
      message: e instanceof Error ? e.message : String(e),
    });
    return err(500, "ADMIN_V4_ROUTE_JOB_FAILED", "Failed to route job");
  }
}
