import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobs } from "../../../../../../db/schema/job";
import { jobPayments } from "../../../../../../db/schema/jobPayment";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { calculatePayoutBreakdown, paymentReady } from "@8fold/shared";
import { createPaymentIntent } from "../../../../../../src/payments/stripe";
import { getBaseUrl } from "../../../../../../src/lib/getBaseUrl";
import { classifyJobPosterRouteError } from "../../../../../../src/http/jobPosterRouteErrors";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "POST /api/web/job-poster/drafts-v2/create-payment-intent";

function errorJson(
  status: number,
  code: string,
  message: string,
  traceId: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { success: false, code, message, traceId, ...extra },
    { status },
  );
}

function buildJobInsertValues(args: {
  jobId: string;
  draft: typeof jobDraftV2.$inferSelect;
  details: Record<string, unknown>;
  data: Record<string, unknown>;
  userId: string;
  laborCents: number;
  materialsCents: number;
  amountCents: number;
  stripeCurrency: "cad" | "usd";
  breakdown: ReturnType<typeof calculatePayoutBreakdown>;
  now: Date;
}) {
  const { jobId, draft, details, data, userId, laborCents, materialsCents, amountCents, stripeCurrency, breakdown, now } = args;
  return {
    id: jobId,
    status: "DRAFT" as any,
    archived: false,
    title: String(details.title ?? "Job").trim().slice(0, 255),
    scope: String(details.scope ?? "").trim().slice(0, 5000),
    region: `${draft.stateCode}-${draft.countryCode}`.toLowerCase(),
    country: draft.countryCode as any,
    countryCode: draft.countryCode as any,
    stateCode: draft.stateCode,
    currency: (draft.countryCode === "CA" ? "CAD" : "USD") as "CAD" | "USD",
    jobPosterUserId: userId,
    jobType: (details.jobType ?? "urban") as any,
    tradeCategory: (details.tradeCategory ?? "HANDYMAN") as any,
    serviceType: "handyman",
    laborTotalCents: laborCents,
    materialsTotalCents: materialsCents,
    transactionFeeCents: breakdown.transactionFeeCents,
    contractorPayoutCents: breakdown.contractorPayoutCents,
    routerEarningsCents: breakdown.routerEarningsCents,
    brokerFeeCents: breakdown.platformFeeCents,
    amountCents,
    paymentCurrency: stripeCurrency,
    junkHaulingItems: details.items ?? [],
    availability: data.availability ?? null,
    lat: details.geo && typeof (details.geo as any).lat === "number" ? (details.geo as any).lat : null,
    lng: details.geo && typeof (details.geo as any).lng === "number" ? (details.geo as any).lng : null,
    city: (details.geo as any)?.city ?? (details.address as string) ?? null,
    publishedAt: now,
    postedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(req: Request) {
  const traceId = randomUUID();
  let userId: string | null = null;
  let draftId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;

    const body = (await req.json().catch(() => null)) as {
      draftId?: string;
      expectedVersion?: number;
    } | null;

    const id = String(body?.draftId ?? "").trim();
    const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;

    draftId = id || null;

    if (!id) return errorJson(400, "MISSING_DRAFT_ID", "Missing draftId.", traceId);
    if (typeof expectedVersion !== "number") {
      return errorJson(400, "MISSING_EXPECTED_VERSION", "Missing expectedVersion.", traceId);
    }

    const draftRows = await db
      .select()
      .from(jobDraftV2)
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
      .limit(1);
    const draft = draftRows[0] ?? null;

    if (!draft) return errorJson(404, "DRAFT_NOT_FOUND", "Draft not found.", traceId);
    if (draft.currentStep !== "PRICING") {
      return errorJson(409, "STEP_INVALID", "Payment intent can only be created from PRICING step.", traceId);
    }

    const data = (draft.data ?? {}) as Record<string, unknown>;
    const pricing = (data.pricing ?? {}) as Record<string, unknown>;
    if (pricing.appraisalStatus !== "ready") {
      return errorJson(400, "APPRAISAL_NOT_READY", "Pricing appraisal is not ready.", traceId);
    }

    if (!paymentReady(data as any)) {
      return errorJson(400, "PAYMENT_NOT_READY", "Payment step requirements are incomplete.", traceId);
    }

    const stripeMode = String(process.env.STRIPE_MODE ?? "test").trim().toLowerCase();
    const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
    if (!stripeWebhookSecret || stripeMode !== "test") {
      return errorJson(400, "STRIPE_WEBHOOK_NOT_CONFIGURED", "Stripe webhook is not configured.", traceId);
    }

    // Idempotent return path: existing PI on draft (no version change).
    if (draft.paymentIntentId) {
      const { stripe } = await import("../../../../../../src/payments/stripe");
      if (stripe) {
        const pi = await stripe.paymentIntents.retrieve(draft.paymentIntentId);
        if (pi.client_secret) {
          return NextResponse.json({
            success: true,
            clientSecret: pi.client_secret,
            returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
            amount: pi.amount,
            currency: draft.countryCode === "CA" ? "cad" : "usd",
            traceId,
          });
        }
      }
    }
    if (expectedVersion !== draft.version) {
      return errorJson(409, "VERSION_CONFLICT", "Draft version conflict.", traceId);
    }

    const laborCents = Number((pricing.selectedPriceCents as number) ?? 0);
    if (!Number.isInteger(laborCents) || laborCents <= 0) {
      return errorJson(400, "INVALID_LABOR_AMOUNT", "Labor amount must be a positive integer.", traceId);
    }

    const materialsCents = 0;
    const breakdown = calculatePayoutBreakdown(laborCents, materialsCents);
    const amountCents = breakdown.totalJobPosterPaysCents;
    const stripeCurrency = draft.countryCode === "CA" ? "cad" : "usd";

    const details = (data.details ?? {}) as Record<string, unknown>;
    const now = new Date();

    const claimResult = await db.transaction(async (tx) => {
      const draftRowsTx = await tx
        .select()
        .from(jobDraftV2)
        .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
        .limit(1);
      const txDraft = draftRowsTx[0] ?? null;
      if (!txDraft) return { ok: false as const, code: "DRAFT_NOT_FOUND" as const };

      if (txDraft.paymentIntentId) {
        return {
          ok: false as const,
          code: "PAYMENT_INTENT_EXISTS" as const,
          paymentIntentId: txDraft.paymentIntentId,
          countryCode: txDraft.countryCode,
        };
      }

      if (txDraft.currentStep !== "PRICING") {
        return { ok: false as const, code: "STEP_INVALID" as const };
      }

      const txData = (txDraft.data ?? {}) as Record<string, unknown>;
      const txPricing = (txData.pricing ?? {}) as Record<string, unknown>;
      if (txPricing.appraisalStatus !== "ready" || !paymentReady(txData as any)) {
        return { ok: false as const, code: "PAYMENT_NOT_READY" as const };
      }

      const stableJobId = String(txDraft.jobId ?? "").trim();
      if (stableJobId) {
        // Enforce invariant: every claimed draft.jobId must reference an existing job row.
        const existingJob = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, stableJobId)).limit(1);
        if (!existingJob[0]) {
          await tx.insert(jobs).values(
            buildJobInsertValues({
              jobId: stableJobId,
              draft: txDraft,
              details,
              data,
              userId: user.userId,
              laborCents,
              materialsCents,
              amountCents,
              stripeCurrency,
              breakdown,
              now,
            }),
          );
        }
        if (expectedVersion !== txDraft.version) {
          return { ok: false as const, code: "VERSION_CONFLICT" as const };
        }
        return { ok: true as const, jobId: stableJobId, activeVersion: txDraft.version };
      }

      if (expectedVersion !== txDraft.version) {
        return { ok: false as const, code: "VERSION_CONFLICT" as const };
      }

      const newJobId = randomUUID();
      await tx.insert(jobs).values(
        buildJobInsertValues({
          jobId: newJobId,
          draft: txDraft,
          details,
          data,
          userId: user.userId,
          laborCents,
          materialsCents,
          amountCents,
          stripeCurrency,
          breakdown,
          now,
        }),
      );
      const claimUpdate = await tx
        .update(jobDraftV2)
        .set({
          jobId: newJobId,
          updatedAt: now,
          version: txDraft.version + 1,
        })
        .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.version, txDraft.version), isNull(jobDraftV2.jobId)))
        .returning({ id: jobDraftV2.id });
      if (claimUpdate.length === 0) {
        return { ok: false as const, code: "VERSION_CONFLICT" as const };
      }
      return { ok: true as const, jobId: newJobId, activeVersion: txDraft.version + 1 };
    });

    if (!claimResult.ok) {
      if (claimResult.code === "PAYMENT_INTENT_EXISTS") {
        const { stripe } = await import("../../../../../../src/payments/stripe");
        if (stripe) {
          const existingPi = await stripe.paymentIntents.retrieve(claimResult.paymentIntentId);
          if (existingPi.client_secret) {
            return NextResponse.json({
              success: true,
              clientSecret: existingPi.client_secret,
              returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
              amount: existingPi.amount,
              currency: claimResult.countryCode === "CA" ? "cad" : "usd",
              traceId,
            });
          }
        }
        return errorJson(409, "VERSION_CONFLICT", "Draft already has payment intent.", traceId);
      }
      if (claimResult.code === "DRAFT_NOT_FOUND") {
        return errorJson(404, "DRAFT_NOT_FOUND", "Draft not found.", traceId);
      }
      if (claimResult.code === "STEP_INVALID") {
        return errorJson(409, "STEP_INVALID", "Payment intent can only be created from PRICING step.", traceId);
      }
      if (claimResult.code === "PAYMENT_NOT_READY") {
        return errorJson(400, "PAYMENT_NOT_READY", "Payment step requirements are incomplete.", traceId);
      }
      return errorJson(409, "VERSION_CONFLICT", "Draft version conflict.", traceId);
    }

    const jobId = claimResult.jobId;

    const idempotencyKey = `draftV2:${id}:pi`;
    let pi: Awaited<ReturnType<typeof createPaymentIntent>>;
    try {
      pi = await createPaymentIntent(amountCents, {
        currency: stripeCurrency as "cad" | "usd",
        idempotencyKey,
        captureMethod: "automatic",
        confirmationMethod: "automatic",
        description: `8Fold Job Escrow – ${jobId}`,
        metadata: {
          type: "job_escrow",
          jobId,
          jobPosterUserId: user.userId,
          userId: user.userId,
          environment: String(process.env.NODE_ENV ?? "development"),
        },
      });
    } catch (err) {
      logEvent({
        level: "error",
        event: "job_draft_v2.create_payment_intent.stripe_failed",
        route,
        context: { traceId, draftId: id, userId, message: err instanceof Error ? err.message : "unknown" },
      });
      return errorJson(500, "STRIPE_FAILED", "Stripe payment creation failed.", traceId);
    }

    const attachResult = await db.transaction(async (tx) => {
      const draftRowsTx = await tx
        .select()
        .from(jobDraftV2)
        .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
        .limit(1);
      const txDraft = draftRowsTx[0] ?? null;
      if (!txDraft) return { ok: false as const, code: "DRAFT_NOT_FOUND" as const };

      if (txDraft.paymentIntentId) {
        return {
          ok: false as const,
          code: "PAYMENT_INTENT_EXISTS" as const,
          paymentIntentId: txDraft.paymentIntentId,
          countryCode: txDraft.countryCode,
        };
      }

      const existingPayment = await tx.select({ id: jobPayments.id }).from(jobPayments).where(eq(jobPayments.jobId, jobId)).limit(1);
      if (existingPayment[0]) {
        await tx
          .update(jobPayments)
          .set({
            stripePaymentIntentId: pi.paymentIntentId,
            stripePaymentIntentStatus: pi.status,
            amountCents,
            status: "PENDING",
            updatedAt: now,
          })
          .where(eq(jobPayments.id, existingPayment[0].id));
      } else {
        await tx.insert(jobPayments).values({
          id: randomUUID(),
          jobId,
          stripePaymentIntentId: pi.paymentIntentId,
          stripePaymentIntentStatus: pi.status,
          amountCents,
          status: "PENDING",
          updatedAt: now,
        });
      }

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: user.userId,
        action: "PAYMENT_INTENT_CREATED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          stripePaymentIntentId: pi.paymentIntentId,
          draftId: id,
          selectedPriceCents: laborCents,
          totalCents: amountCents,
        },
      });

      const updateResult = await tx
        .update(jobDraftV2)
        .set({
          jobId,
          paymentIntentId: pi.paymentIntentId,
          paymentIntentCreatedAt: now,
          updatedAt: now,
          version: txDraft.version + 1,
        })
        .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.version, txDraft.version)))
        .returning({ id: jobDraftV2.id, version: jobDraftV2.version });

      if (updateResult.length === 0) {
        return { ok: false as const, code: "VERSION_CONFLICT" as const };
      }

      return { ok: true as const, versionBefore: txDraft.version, versionAfter: txDraft.version + 1 };
    });

    if (!attachResult.ok) {
      if (attachResult.code === "PAYMENT_INTENT_EXISTS") {
        const { stripe } = await import("../../../../../../src/payments/stripe");
        if (stripe) {
          const existingPi = await stripe.paymentIntents.retrieve(attachResult.paymentIntentId);
          if (existingPi.client_secret) {
            return NextResponse.json({
              success: true,
              clientSecret: existingPi.client_secret,
              returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
              amount: existingPi.amount,
              currency: attachResult.countryCode === "CA" ? "cad" : "usd",
              traceId,
            });
          }
        }
        return errorJson(409, "VERSION_CONFLICT", "Draft already has payment intent.", traceId);
      }
      if (attachResult.code === "DRAFT_NOT_FOUND") {
        return errorJson(404, "DRAFT_NOT_FOUND", "Draft not found.", traceId);
      }
      return errorJson(409, "VERSION_CONFLICT", "Draft version conflict.", traceId);
    }

    logEvent({
      level: "info",
      event: "job_draft_v2.create_payment_intent",
      route,
      context: {
        traceId,
        draftId: id,
        userId,
        jobId,
        versionBefore: attachResult.versionBefore,
        versionAfter: attachResult.versionAfter,
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: pi.clientSecret,
      returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
      amount: amountCents,
      currency: stripeCurrency,
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.create_payment_intent.failed",
      route,
      context: { traceId, userId, draftId, message: err instanceof Error ? err.message : "unknown" },
    });
    const { status } = classifyJobPosterRouteError(err);
    return errorJson(
      status >= 400 && status < 600 ? status : 500,
      "CREATE_PAYMENT_INTENT_FAILED",
      "Failed to create payment intent.",
      traceId,
    );
  }
}
