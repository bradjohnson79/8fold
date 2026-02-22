import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";
import { repeatContractorRequests } from "../../../../../db/schema/repeatContractorRequest";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { contractors } from "../../../../../db/schema/contractor";
import { jobPayments } from "../../../../../db/schema/jobPayment";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;

    const where = and(
      eq(jobs.archived, false),
      eq(jobs.job_poster_user_id, user.userId),
      status ? eq(jobs.status, status as any) : undefined,
    );

    const base = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        region: jobs.region,
        city: jobs.city,
        regionCode: jobs.region_code,
        tradeCategory: jobs.trade_category,
        status: jobs.status,
        paymentStatus: jobs.payment_status,
        payoutStatus: jobs.payout_status,
        createdAt: jobs.created_at,
        publishedAt: jobs.published_at,
        contactedAt: jobs.contacted_at,
        guaranteeEligibleAt: jobs.guarantee_eligible_at,
        laborTotalCents: jobs.labor_total_cents,
        materialsTotalCents: jobs.materials_total_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        repeatContractorDiscountCents: jobs.repeat_contractor_discount_cents,
        escrowLockedAt: jobs.escrow_locked_at,
        paymentCapturedAt: jobs.payment_captured_at,
        paymentReleasedAt: jobs.payment_released_at,
        contractorCompletedAt: jobs.contractor_completed_at,
        customerApprovedAt: jobs.customer_approved_at,
        routerApprovedAt: jobs.router_approved_at,
      })
      .from(jobs)
      .where(where)
      .orderBy(desc(jobs.created_at))
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

    return ok({ jobs: out });
  } catch (err) {
    return handleApiError(err, "GET /api/web/job-poster/jobs");
  }
}

