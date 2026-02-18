import { NextResponse } from "next/server";
import { requireAdminOrRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { assertJobTransition } from "../../../../../../src/jobs/jobTransitions";
import { generateActionToken, hashActionToken } from "../../../../../../src/jobs/actionTokens";
import { haversineKm, stateFromRegion } from "../../../../../../src/jobs/geo";
import { geocodeCityCentroid, regionToCityState } from "../../../../../../src/jobs/geocode";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { contractors } from "../../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../../db/schema/job";
import { users } from "../../../../../../db/schema/user";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/assign
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  contractorId: z.string().min(1),
  overrideDistance: z.boolean().optional(),
  overrideReason: z.string().trim().min(3).max(500).optional()
});

export async function POST(req: Request) {
  const actor = await requireAdminOrRouter(req);
  if (actor instanceof NextResponse) return actor;

  try {
    const jobId = getIdFromUrl(req);
    const body = BodySchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const result = await db.transaction(async (tx: any) => {
      const jobRows = await tx
        .select({
          id: jobs.id,
          archived: jobs.archived,
          status: jobs.status,
          region: jobs.region,
          jobType: jobs.jobType,
          lat: jobs.lat,
          lng: jobs.lng,
          routerUserId: jobs.claimedByUserId,
          contractorActionTokenHash: jobs.contractorActionTokenHash,
          customerActionTokenHash: jobs.customerActionTokenHash,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.archived) return { kind: "archived_job_not_assignable" as const };

      assertJobTransition(job.status, "ASSIGNED");

      const contractorRows = await tx
        .select({
          id: contractors.id,
          status: contractors.status,
          regions: contractors.regions,
          lat: contractors.lat,
          lng: contractors.lng,
        })
        .from(contractors)
        .innerJoin(users, sql`lower(${users.email}) = lower(${contractors.email})`)
        .where(and(eq(contractors.id, body.data.contractorId), eq(users.status, "ACTIVE")))
        .limit(1);
      const contractor = contractorRows[0] ?? null;
      if (!contractor) return { kind: "contractor_not_found" as const };
      if (contractor.status !== "APPROVED") {
        return { kind: "contractor_not_approved" as const };
      }

      const jobState = stateFromRegion(job.region);
      const contractorStates = (contractor.regions ?? []).map(stateFromRegion);
      const sameState = jobState && contractorStates.includes(jobState);
      if (!sameState) {
        return { kind: "state_mismatch" as const };
      }

      const overrideDistance = Boolean(body.data.overrideDistance);
      if (overrideDistance && !body.data.overrideReason) {
        return { kind: "override_reason_required" as const };
      }

      if (
        typeof contractor.lat !== "number" ||
        typeof contractor.lng !== "number"
      ) {
        return { kind: "missing_coordinates" as const };
      }

      let jobLat = typeof job.lat === "number" ? job.lat : null;
      let jobLng = typeof job.lng === "number" ? job.lng : null;

      if (jobLat === null || jobLng === null) {
        const cs = regionToCityState(job.region);
        if (!cs) return { kind: "unable_to_resolve_coords" as const };
        const routerCountryRows = job.routerUserId
          ? await tx
              .select({ country: users.country })
              .from(users)
              .where(eq(users.id, job.routerUserId))
              .limit(1)
          : [];
        const routerCountry = routerCountryRows[0]?.country ?? null;
        const country = routerCountry === "CA" ? "Canada" : routerCountry === "US" ? "United States" : undefined;
        const resolved = await geocodeCityCentroid({ city: cs.city, state: cs.state, country });
        if (!resolved) return { kind: "unable_to_resolve_coords" as const };
        await tx
          .update(jobs)
          .set({ lat: resolved.lat, lng: resolved.lng } as any)
          .where(eq(jobs.id, job.id));
        jobLat = resolved.lat;
        jobLng = resolved.lng;
      }

      const km = haversineKm({ lat: jobLat, lng: jobLng }, { lat: contractor.lat, lng: contractor.lng });
      const routerCountryRows2 = job.routerUserId
        ? await tx
            .select({ country: users.country })
            .from(users)
            .where(eq(users.id, job.routerUserId))
            .limit(1)
        : [];
      const routerCountry = routerCountryRows2[0]?.country ?? null;
      const isCA = routerCountry === "CA";
      const maxKm =
        job.jobType === "urban"
          ? isCA
            ? 50
            : 30 * 1.609344
          : isCA
            ? 100
            : 60 * 1.609344;

      if (km > maxKm && !overrideDistance) {
        return { kind: "distance_exceeded" as const };
      }

      const assignmentExisting = await tx
        .select({ id: jobAssignments.id })
        .from(jobAssignments)
        .where(eq(jobAssignments.jobId, jobId))
        .limit(1);
      const assignment =
        assignmentExisting[0]?.id
          ? (
              await tx
                .update(jobAssignments)
                .set({
                  contractorId: contractor.id,
                  assignedByAdminUserId: actor.userId,
                  status: "ASSIGNED",
                  completedAt: null,
                } as any)
                .where(eq(jobAssignments.id, assignmentExisting[0].id))
                .returning()
            )[0]
          : (
              await tx
                .insert(jobAssignments)
                .values({
                  id: crypto.randomUUID(),
                  jobId,
                  contractorId: contractor.id,
                  assignedByAdminUserId: actor.userId,
                  status: "ASSIGNED",
                } as any)
                .returning()
            )[0];

      const contractorToken = job.contractorActionTokenHash ? null : generateActionToken();
      const customerToken = job.customerActionTokenHash ? null : generateActionToken();

      const updatedJobRows = await tx
        .update(jobs)
        .set({
          status: "ASSIGNED",
          contractorActionTokenHash: contractorToken ? hashActionToken(contractorToken) : (job.contractorActionTokenHash as any),
          customerActionTokenHash: customerToken ? hashActionToken(customerToken) : (job.customerActionTokenHash as any),
        } as any)
        .where(eq(jobs.id, jobId))
        .returning();
      const updatedJob = updatedJobRows[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: actor.userId,
        action: "JOB_ASSIGN_CONTRACTOR",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          toStatus: updatedJob.status,
          contractorId: contractor.id,
          assignmentId: (assignment as any).id,
          jobType: job.jobType,
          distanceKm: km,
          maxDistanceKm: maxKm,
          overrideDistance,
          overrideReason: overrideDistance ? body.data.overrideReason : undefined,
        } as any,
      });

      return { kind: "ok" as const, job: updatedJob, assignment, contractorToken, customerToken };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (result.kind === "archived_job_not_assignable")
      return NextResponse.json({ ok: false, error: "Archived jobs cannot be assigned" }, { status: 409 });
    if (result.kind === "contractor_not_found") return NextResponse.json({ ok: false, error: "Contractor not found" }, { status: 404 });
    if (result.kind === "contractor_not_approved") return NextResponse.json({ ok: false, error: "Contractor is not approved" }, { status: 409 });
    if (result.kind === "state_mismatch")
      return NextResponse.json({ ok: false, error: "Contractor must be in the same state/province for this job." }, { status: 409 });
    if (result.kind === "missing_coordinates")
      return NextResponse.json({ ok: false, error: "Missing coordinates. Cannot validate service distance for this job." }, { status: 409 });
    if (result.kind === "unable_to_resolve_coords")
      return NextResponse.json({ ok: false, error: "Unable to resolve job location coordinates." }, { status: 409 });
    if (result.kind === "override_reason_required")
      return NextResponse.json({ ok: false, error: "Override reason required." }, { status: 400 });
    if (result.kind === "distance_exceeded")
      return NextResponse.json(
        { ok: false, error: "This contractor is outside the allowable service distance for this job." },
        { status: 409 }
      );

    return NextResponse.json({
      ok: true,
      data: {
        job: result.job,
        assignment: result.assignment,
        actionTokens: { contractorToken: result.contractorToken, customerToken: result.customerToken },
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/assign", { route: "/api/admin/jobs/[id]/assign", userId: actor.userId });
  }
}

