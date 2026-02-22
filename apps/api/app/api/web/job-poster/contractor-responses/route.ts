import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractors } from "../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";

type ResponseStatus = "AWAITING_APPOINTMENT_PROPOSAL" | "APPOINTMENT_PROPOSED" | "IN_PROGRESS";

function titleCase(s: string): string {
  return s
    .split("_")
    .join(" ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatRegionCode(regionCode: string | null | undefined): { city: string | null; state: string | null } {
  if (!regionCode) return { city: null, state: null };
  if (regionCode.includes(",")) {
    const [c, st] = regionCode.split(",").map((x) => x.trim());
    return { city: c || null, state: st || null };
  }
  if (regionCode.includes("-")) {
    const parts = regionCode.split("-").filter(Boolean);
    const state = (parts[parts.length - 1] ?? "").toUpperCase() || null;
    const city = parts
      .slice(0, -1)
      .join(" ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
    return { city: city || null, state };
  }
  return { city: regionCode, state: null };
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const jobRows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        region: jobs.region,
        status: jobs.status,
        estimatedCompletionDate: jobs.estimated_completion_date,
        assignment_contractorId: jobAssignments.contractorId,
        contractor_id: contractors.id,
        contractor_businessName: contractors.businessName,
        contractor_trade: contractors.trade,
        contractor_regionCode: contractors.regionCode,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
      .where(and(eq(jobs.job_poster_user_id, u.userId), inArray(jobs.status, ["ASSIGNED", "IN_PROGRESS"])))
      .orderBy(desc(jobs.published_at))
      .limit(25);

    const baseItems = jobRows.flatMap((row) => {
      const contractor =
        row.contractor_id && row.assignment_contractorId
          ? {
              id: row.contractor_id,
              businessName: row.contractor_businessName,
              trade: row.contractor_trade,
              regionCode: row.contractor_regionCode,
            }
          : null;
      if (!contractor) return [];
      const job = {
        id: row.id,
        title: row.title,
        region: row.region,
        status: row.status,
        estimatedCompletionDate: row.estimatedCompletionDate,
      };
      return [{ job, contractor }] as const;
    });

    const responses = await Promise.all(
      baseItems.map(async ({ job, contractor }) => {
          const proposedRows = await db
            .select({ metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.action, "APPOINTMENT_PROPOSED"),
                eq(auditLogs.entityType, "Job"),
                eq(auditLogs.entityId, job.id),
              ),
            )
            .orderBy(desc(auditLogs.createdAt))
            .limit(1);
          const proposed = proposedRows[0] ?? null;
          const proposedMeta = (proposed?.metadata ?? null) as any;
          const appointmentProposedForThisContractor =
            proposedMeta?.contractorId && String(proposedMeta.contractorId) === contractor.id;

          const sharedRows = await db
            .select({ metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.action, "JOB_POSTER_CONTACT_SHARED"),
                eq(auditLogs.entityType, "Job"),
                eq(auditLogs.entityId, job.id),
              ),
            )
            .orderBy(desc(auditLogs.createdAt))
            .limit(1);
          const shared = sharedRows[0] ?? null;
          const sharedMeta = (shared?.metadata ?? null) as any;
          const contactSharedForThisContractor =
            sharedMeta?.contractorId && String(sharedMeta.contractorId) === contractor.id;

          let status: ResponseStatus = "AWAITING_APPOINTMENT_PROPOSAL";
          if (job.status === "IN_PROGRESS" || contactSharedForThisContractor) status = "IN_PROGRESS";
          else if (appointmentProposedForThisContractor) status = "APPOINTMENT_PROPOSED";

          const loc = formatRegionCode(contractor.regionCode);

          return {
            job: { id: job.id, title: job.title, region: job.region, status: job.status },
            contractor: {
              id: contractor.id,
              name: contractor.businessName,
              profession: titleCase(String(contractor.trade)),
              yearsExperienceRounded: null as number | null,
              city: loc.city,
              state: loc.state
            },
            status,
            appointment: appointmentProposedForThisContractor
              ? {
                  day: typeof proposedMeta?.day === "string" ? proposedMeta.day : null,
                  timeOfDay: typeof proposedMeta?.timeOfDay === "string" ? proposedMeta.timeOfDay : null,
                  proposedAt: proposed ? proposed.createdAt.toISOString() : null
                }
              : null
            ,
            estimatedCompletionDate: job.estimatedCompletionDate ? job.estimatedCompletionDate.toISOString().slice(0, 10) : null
          };
        })
    );

    return NextResponse.json({ ok: true, responses: responses.filter(Boolean) });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

