import { NextResponse } from "next/server";
import { optionalUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/db/drizzle";
import {
  auditLogs,
  contractors,
  jobAssignments,
  jobs,
  materialsEscrows,
  materialsItems,
  materialsReceiptFiles,
  materialsReceiptSubmissions,
  materialsRequests,
  users,
} from "../../../../db/schema";
import { isJobActive } from "../../../../src/utils/jobActive";

const CreateBodySchema = z.object({
  jobId: z.string().trim().min(10),
  currency: z.enum(["USD", "CAD"]).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        category: z.string().trim().min(2).max(80),
        quantity: z.number().int().min(1).max(999),
        unitPriceCents: z.number().int().min(1).max(5_000_000),
        priceUrl: z.string().trim().url().max(500).optional()
      })
    )
    .min(1)
    .max(50)
});

function sumTotal(items: { quantity: number; unitPriceCents: number }[]): number {
  return items.reduce((acc, it) => acc + it.quantity * it.unitPriceCents, 0);
}

/**
 * GET: fetch materials request for a job (role-safe via ownership checks)
 * - Job Poster: jobPosterUserId match
 * - Contractor: assignment contractor match
 * - Router: routerId match
 *
 * POST: contractor creates a request (job must be ASSIGNED or IN_PROGRESS)
 */
export async function GET(req: Request) {
  try {
    const u = await optionalUser(req);
    if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId")?.trim() ?? "";
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    const job =
      (
        await db
          .select({ id: jobs.id, routerId: jobs.claimedByUserId, jobPosterUserId: jobs.jobPosterUserId })
          .from(jobs)
          .where(eq(jobs.id, jobId))
          .limit(1)
      )[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const assignment =
      (
        await db
          .select({ contractorId: jobAssignments.contractorId })
          .from(jobAssignments)
          .where(eq(jobAssignments.jobId, jobId))
          .limit(1)
      )[0] ?? null;

    const isJobPoster = job.jobPosterUserId === u.userId;
    const isRouter = job.routerId === u.userId;

    // Contractor: match by email → contractor → assignment
    const user =
      (
        await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, u.userId))
          .limit(1)
      )[0] ?? null;
    let isContractor = false;
    let contractorId: string | null = null;
    if (user?.email && assignment?.contractorId) {
      const contractor =
        (
          await db
            .select({ id: contractors.id, email: contractors.email })
            .from(contractors)
            .where(eq(contractors.id, assignment.contractorId))
            .limit(1)
        )[0] ?? null;
      if (contractor?.email && contractor.email.toLowerCase() === user.email.toLowerCase()) {
        isContractor = true;
        contractorId = contractor.id;
      }
    }

    if (!isJobPoster && !isRouter && !isContractor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const latest =
      (
        await db
          .select({
            id: materialsRequests.id,
            status: materialsRequests.status,
            submittedAt: materialsRequests.submittedAt,
            approvedAt: materialsRequests.approvedAt,
            declinedAt: materialsRequests.declinedAt,
            currency: materialsRequests.currency,
            totalAmountCents: materialsRequests.totalAmountCents,
            contractorId: materialsRequests.contractorId,
            jobPosterUserId: materialsRequests.jobPosterUserId,
          })
          .from(materialsRequests)
          .where(eq(materialsRequests.jobId, jobId))
          .orderBy(desc(materialsRequests.createdAt))
          .limit(1)
      )[0] ?? null;

    let reqRow: any = null;
    if (latest?.id) {
      const items = await db
        .select({
          id: materialsItems.id,
          name: materialsItems.name,
          category: materialsItems.category,
          quantity: materialsItems.quantity,
          unitPriceCents: materialsItems.unitPriceCents,
          priceUrl: materialsItems.priceUrl,
        })
        .from(materialsItems)
        .where(eq(materialsItems.requestId, latest.id));

      const receipts =
        (
          await db
            .select({
              id: materialsReceiptSubmissions.id,
              status: materialsReceiptSubmissions.status,
              receiptSubtotalCents: materialsReceiptSubmissions.receiptSubtotalCents,
              receiptTaxCents: materialsReceiptSubmissions.receiptTaxCents,
              receiptTotalCents: materialsReceiptSubmissions.receiptTotalCents,
              submittedAt: materialsReceiptSubmissions.submittedAt,
            })
            .from(materialsReceiptSubmissions)
            .where(eq(materialsReceiptSubmissions.requestId, latest.id))
            .limit(1)
        )[0] ?? null;

      const receiptFiles = receipts?.id
        ? await db
            .select({
              id: materialsReceiptFiles.id,
              originalName: materialsReceiptFiles.originalName,
              mimeType: materialsReceiptFiles.mimeType,
              sizeBytes: materialsReceiptFiles.sizeBytes,
              storageKey: materialsReceiptFiles.storageKey,
            })
            .from(materialsReceiptFiles)
            .where(eq(materialsReceiptFiles.submissionId, receipts.id))
        : [];

      const escrow =
        (
          await db
            .select({
              id: materialsEscrows.id,
              status: materialsEscrows.status,
              amountCents: materialsEscrows.amountCents,
              releaseDueAt: materialsEscrows.releaseDueAt,
              releasedAt: materialsEscrows.releasedAt,
            })
            .from(materialsEscrows)
            .where(eq(materialsEscrows.requestId, latest.id))
            .limit(1)
        )[0] ?? null;

      reqRow = {
        ...latest,
        items,
        receipts: receipts ? { ...receipts, files: receiptFiles } : null,
        escrow: escrow ? { ...escrow } : null,
      };
    }

    // Router gets read-only; job poster and contractor also read-only here.
    return NextResponse.json({
      request: reqRow,
      viewer: { isJobPoster, isRouter, isContractor, contractorId }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const u = await optionalUser(req);
    if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = CreateBodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const job =
      (
        await db
          .select({
            id: jobs.id,
            status: jobs.status,
            paymentStatus: jobs.paymentStatus,
            routerId: jobs.claimedByUserId,
            jobPosterUserId: jobs.jobPosterUserId,
          })
          .from(jobs)
          .where(eq(jobs.id, body.data.jobId))
          .limit(1)
      )[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isJobActive(job)) {
      return NextResponse.json(
        { ok: false, error: "Job is not active. Parts & Materials unavailable." },
        { status: 400 },
      );
    }

    if (job.status !== "ASSIGNED" && job.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Materials requests require ASSIGNED or IN_PROGRESS." }, { status: 409 });
    }
    if (!job.jobPosterUserId) {
      return NextResponse.json({ error: "Job has no Job Poster on record." }, { status: 409 });
    }

    const user =
      (
        await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.id, u.userId))
          .limit(1)
      )[0] ?? null;
    if (!user?.email) return NextResponse.json({ error: "Missing user email" }, { status: 400 });

    const assignment =
      (
        await db
          .select({ contractorId: jobAssignments.contractorId })
          .from(jobAssignments)
          .where(eq(jobAssignments.jobId, job.id))
          .limit(1)
      )[0] ?? null;
    if (!assignment) return NextResponse.json({ error: "Job is not assigned" }, { status: 409 });

    const contractor =
      (
        await db
          .select({ id: contractors.id, email: contractors.email })
          .from(contractors)
          .where(eq(contractors.id, assignment.contractorId))
          .limit(1)
      )[0] ?? null;
    if (!contractor?.email) return NextResponse.json({ error: "Contractor has no email on record" }, { status: 409 });
    if (contractor.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Waiver gate: must be accepted before contractor can request materials.
    const waiver =
      (
        await db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
              eq(auditLogs.entityType, "Contractor"),
              eq(auditLogs.entityId, contractor.id),
              eq(auditLogs.actorUserId, user.id),
            ),
          )
          .limit(1)
      )[0] ?? null;
    if (!waiver) {
      return NextResponse.json({ error: "Contractor waiver must be accepted before requesting materials." }, { status: 403 });
    }

    const existingPending =
      (
        await db
          .select({ id: materialsRequests.id })
          .from(materialsRequests)
          .where(and(eq(materialsRequests.jobId, job.id), eq(materialsRequests.status, "SUBMITTED" as any)))
          .limit(1)
      )[0] ?? null;
    if (existingPending) {
      return NextResponse.json({ error: "A materials request is already pending for this job." }, { status: 409 });
    }

    const totalAmountCents = sumTotal(body.data.items);

    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const requestId = randomUUID();
      await tx.insert(materialsRequests).values({
        id: requestId,
        jobId: job.id,
        contractorId: contractor.id,
        jobPosterUserId: job.jobPosterUserId!,
        routerUserId: job.routerId ? String(job.routerId) : undefined,
        status: "SUBMITTED" as any,
        currency: (body.data.currency ?? "USD") as any,
        totalAmountCents,
        updatedAt: now,
      });

      await tx.insert(materialsItems).values(
        body.data.items.map((it) => ({
          id: randomUUID(),
          requestId,
          name: it.name,
          category: it.category,
          quantity: it.quantity,
          unitPriceCents: it.unitPriceCents,
          priceUrl: it.priceUrl ? it.priceUrl : null,
        })),
      );

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "MATERIALS_REQUEST_SUBMITTED",
        entityType: "MaterialsRequest",
        entityId: requestId,
        metadata: { jobId: job.id, totalAmountCents } as any,
      });

      return { id: requestId };
    });

    return NextResponse.json({ ok: true, requestId: created.id });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

