import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";
import { repeatContractorRequests } from "../../../../../db/schema/repeatContractorRequest";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { contractors } from "../../../../../db/schema/contractor";
import { jobPayments } from "../../../../../db/schema/jobPayment";
import { requireJobPoster } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";

export async function GET(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;

    const where = and(
      eq(jobs.archived, false),
      eq(jobs.jobPosterUserId, user.userId),
      status ? eq(jobs.status, status as any) : undefined,
    );

    const base = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        region: jobs.region,
        city: jobs.city,
        regionCode: jobs.regionCode,
        tradeCategory: jobs.tradeCategory,
        status: jobs.status,
        createdAt: jobs.createdAt,
        publishedAt: jobs.publishedAt,
        contactedAt: jobs.contactedAt,
        guaranteeEligibleAt: jobs.guaranteeEligibleAt,
        laborTotalCents: jobs.laborTotalCents,
        materialsTotalCents: jobs.materialsTotalCents,
        transactionFeeCents: jobs.transactionFeeCents,
        repeatContractorDiscountCents: jobs.repeatContractorDiscountCents,
        escrowLockedAt: jobs.escrowLockedAt,
        paymentCapturedAt: jobs.paymentCapturedAt,
        paymentReleasedAt: jobs.paymentReleasedAt,
      })
      .from(jobs)
      .where(where)
      .orderBy(desc(jobs.createdAt))
      .limit(200);

    const ids = base.map((j) => j.id).filter(Boolean) as string[];

    const repeatByJobId = new Map<
      string,
      { status: string; contractorId: string; requestedAt: Date; respondedAt: Date | null }
    >();
    const assignmentByJobId = new Map<
      string,
      { contractorId: string; contractor: { id: string; businessName: string; trade: string; regionCode: string } | null }
    >();
    const paymentByJobId = new Map<
      string,
      { status: string; amountCents: number; stripePaymentIntentStatus: string; refundIssuedAt: Date | null }
    >();

    if (ids.length) {
      const repeatRows = await db
        .select({
          jobId: repeatContractorRequests.jobId,
          status: repeatContractorRequests.status,
          contractorId: repeatContractorRequests.contractorId,
          requestedAt: repeatContractorRequests.requestedAt,
          respondedAt: repeatContractorRequests.respondedAt,
        })
        .from(repeatContractorRequests)
        .where(inArray(repeatContractorRequests.jobId, ids as any));
      for (const r of repeatRows) {
        repeatByJobId.set(r.jobId, {
          status: String(r.status as any),
          contractorId: String(r.contractorId as any),
          requestedAt: r.requestedAt as any,
          respondedAt: (r.respondedAt as any) ?? null,
        });
      }

      const assignmentRows = await db
        .select({
          jobId: jobAssignments.jobId,
          contractorId: jobAssignments.contractorId,
          contractor_id: contractors.id,
          contractor_businessName: contractors.businessName,
          contractor_trade: contractors.trade,
          contractor_regionCode: contractors.regionCode,
        })
        .from(jobAssignments)
        .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
        .where(inArray(jobAssignments.jobId, ids as any));
      for (const a of assignmentRows) {
        assignmentByJobId.set(a.jobId, {
          contractorId: String(a.contractorId as any),
          contractor: a.contractor_id
            ? {
                id: String(a.contractor_id),
                businessName: String(a.contractor_businessName ?? ""),
                trade: String(a.contractor_trade ?? ""),
                regionCode: String(a.contractor_regionCode ?? ""),
              }
            : null,
        });
      }

      const paymentRows = await db
        .select({
          jobId: jobPayments.jobId,
          status: jobPayments.status,
          amountCents: jobPayments.amountCents,
          stripePaymentIntentStatus: jobPayments.stripePaymentIntentStatus,
          refundIssuedAt: jobPayments.refundIssuedAt,
          createdAt: jobPayments.createdAt,
          updatedAt: jobPayments.updatedAt,
        })
        .from(jobPayments)
        .where(inArray(jobPayments.jobId, ids as any))
        .orderBy(desc(jobPayments.updatedAt), desc(jobPayments.createdAt), desc(jobPayments.id));
      for (const p of paymentRows) {
        const jobId = p.jobId ? String(p.jobId) : "";
        if (!jobId) continue;
        if (paymentByJobId.has(jobId)) continue;
        paymentByJobId.set(jobId, {
          status: String(p.status as any),
          amountCents: Number(p.amountCents as any),
          stripePaymentIntentStatus: String(p.stripePaymentIntentStatus as any),
          refundIssuedAt: (p.refundIssuedAt as any) ?? null,
        });
      }
    }

    const out = base.map((j) => ({
      ...j,
      repeatContractorRequest: repeatByJobId.get(j.id) ?? null,
      assignment: assignmentByJobId.get(j.id) ?? null,
      payment: paymentByJobId.get(j.id) ?? null,
    }));

    return NextResponse.json({ jobs: out });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

