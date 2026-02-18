import { NextResponse } from "next/server";
import { handleApiError } from "@/src/lib/errorHandler";
import { refundJobFunds } from "@/src/services/refundJobFunds";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { logEvent } from "@/src/server/observability/log";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { eq } from "drizzle-orm";
import { enforceTier, requireAdminIdentityWithTier } from "../../../_lib/adminTier";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/refund
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  const jobId = getIdFromUrl(req);
  if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

  try {
    const url = new URL(req.url);
    const dryRun = String(url.searchParams.get("dryRun") ?? "").toLowerCase() === "true";

    if (dryRun) {
      const jobRows = await db
        .select({
          id: jobs.id,
          amountCents: jobs.amountCents,
          paymentStatus: jobs.paymentStatus,
          payoutStatus: jobs.payoutStatus,
          fundedAt: jobs.fundedAt,
          releasedAt: jobs.releasedAt,
          refundedAt: jobs.refundedAt,
          stripeChargeId: jobs.stripeChargeId,
          stripePaymentIntentId: jobs.stripePaymentIntentId,
          status: jobs.status,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

      const payoutUpper = String(job.payoutStatus ?? "").toUpperCase();
      const blockedAfterRelease = payoutUpper === "RELEASED";
      const alreadyRefunded = Boolean(job.refundedAt);
      const hasStripeRef = Boolean(job.stripeChargeId || job.stripePaymentIntentId);
      const canAttempt = !blockedAfterRelease && !alreadyRefunded && hasStripeRef;

      return NextResponse.json(
        {
          ok: true,
          data: {
            preview: {
              action: "REFUND",
              willMutate: false,
              canAttemptRefund: canAttempt,
              blockedReasons: [
                ...(blockedAfterRelease ? ["refund_after_release"] : []),
                ...(alreadyRefunded ? ["already_refunded"] : []),
                ...(!hasStripeRef ? ["missing_stripe_ref"] : []),
              ],
              escrowAmountCents: Number(job.amountCents ?? 0),
              current: {
                status: String(job.status ?? ""),
                paymentStatus: String(job.paymentStatus ?? ""),
                payoutStatus: String(job.payoutStatus ?? ""),
                fundedAt: job.fundedAt ? (job.fundedAt as Date).toISOString() : null,
                releasedAt: job.releasedAt ? (job.releasedAt as Date).toISOString() : null,
                refundedAt: job.refundedAt ? (job.refundedAt as Date).toISOString() : null,
              },
              notes: ["Dry run does not call Stripe and does not mutate DB. Backend guards may still refuse."],
            },
          },
        },
        { status: 200 },
      );
    }

    const result = await refundJobFunds(jobId);
    if (result.kind === "ok") {
      logEvent({
        level: "info",
        event: "admin.job_refund",
        route: "/api/admin/jobs/[id]/refund",
        method: "POST",
        status: 200,
        userId: identity.userId,
        code: "STRIPE_REFUND",
        context: { jobId, refundId: result.refundId },
      });
    }

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN" }, {
      action: "ADMIN_JOB_REFUND",
      entityType: "Job",
      entityId: jobId,
      metadata: {
        kind: result.kind,
        refundId: (result as any).refundId ?? null,
        status: (result as any).status ?? null,
      },
      outcome: result.kind === "ok" || result.kind === "already_refunded" ? "OK" : "ERROR",
      error:
        result.kind === "ok" || result.kind === "already_refunded"
          ? undefined
          : String((result as any).kind ?? "refund_failed"),
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (result.kind === "already_refunded") return NextResponse.json({ ok: true, data: { alreadyRefunded: true } }, { status: 200 });
    if (result.kind === "refund_after_release") {
      return NextResponse.json({ ok: false, error: "Cannot refund after payout release" }, { status: 409 });
    }
    if (result.kind === "refund_after_partial_release") {
      return NextResponse.json(
        { ok: false, error: "Cannot refund after partial release (one or more transfer legs already SENT)" },
        { status: 409 },
      );
    }
    if (result.kind === "disputed") {
      return NextResponse.json({ ok: false, error: "Cannot refund while job is disputed. Resolve the dispute first." }, { status: 409 });
    }
    if (result.kind === "not_funded") return NextResponse.json({ ok: false, error: "Job not funded" }, { status: 409 });
    if (result.kind === "missing_stripe_ref") return NextResponse.json({ ok: false, error: "Missing Stripe reference" }, { status: 409 });
    if (result.kind === "bad_amount") return NextResponse.json({ ok: false, error: "Invalid job amount" }, { status: 400 });

    return NextResponse.json({ ok: true, data: { refundId: result.refundId, status: result.status } }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/refund", {
      route: "/api/admin/jobs/[id]/refund",
      userId: identity.userId,
    });
  }
}

