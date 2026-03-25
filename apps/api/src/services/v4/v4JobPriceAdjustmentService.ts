import { randomUUID, randomBytes } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { v4JobPriceAdjustments } from "@/db/schema/v4JobPriceAdjustment";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { appendSystemMessage } from "./v4MessageService";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";
import { logDelivery } from "@/src/services/v4/notifications/notificationDeliveryLogService";
import { stripe } from "@/src/payments/stripe";
import { PLATFORM_FEES } from "@/src/config/platformFees";

// Job must be ASSIGNED (not already in an appraisal review cycle) to submit.
const ALLOWED_JOB_STATUSES = ["ASSIGNED"];

// 24-hour consent link window.
const TOKEN_EXPIRY_HOURS = 24;

// Only active in-flight statuses block a new submission.
// PAID is intentionally excluded so a new request can be made if needed.
const BLOCKING_STATUSES = ["PENDING_REVIEW", "SENT_TO_POSTER", "PAYMENT_PENDING"];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Compute the price difference from the snapshot stored at request time. */
function computeDiff(adj: { requestedPriceCents: number; originalPriceCents: number | null }): number {
  return adj.requestedPriceCents - (adj.originalPriceCents ?? 0);
}

/** Compute the full price breakdown for a given total (Job Poster price). */
function computeBreakdown(totalCents: number): {
  jobPosterTotal: number;
  contractorPayout: number;
  routerCommission: number;
  platformFee: number;
} {
  const contractorPayout = Math.floor(totalCents * PLATFORM_FEES.contractor);
  const routerCommission = Math.floor(totalCents * PLATFORM_FEES.router);
  return {
    jobPosterTotal: totalCents,
    contractorPayout,
    routerCommission,
    platformFee: totalCents - contractorPayout - routerCommission,
  };
}

/**
 * Normalize a price input to integer cents.
 * - If input is already ≥ 100 (looks like cents), use as-is (rounded).
 * - If input is < 100 but > 0 (looks like a dollar amount), multiply by 100.
 * - Handles both { requestedPriceCents } and legacy { requestedPrice } fields.
 */
function normalizePriceToCents(input: unknown): number {
  const raw = input as Record<string, unknown> | undefined;
  if (!raw) return 0;

  if (typeof raw.requestedPriceCents === "number" && raw.requestedPriceCents > 0) {
    return Math.round(raw.requestedPriceCents);
  }
  if (typeof raw.requestedPrice === "number" && raw.requestedPrice > 0) {
    // Treat as dollars — convert to cents.
    return Math.round(raw.requestedPrice * 100);
  }
  return 0;
}

/** Sync the linked support ticket to a terminal status. No-op if no ticket. */
async function syncSupportTicket(supportTicketId: string | null, status: "CLOSED" | "RESOLVED"): Promise<void> {
  if (!supportTicketId) return;
  try {
    await db
      .update(v4SupportTickets)
      .set({ status, updatedAt: new Date() })
      .where(eq(v4SupportTickets.id, supportTicketId));
  } catch (err) {
    // Non-fatal — ticket sync failure must never block the primary action.
    console.error("[APPRAISAL] Support ticket sync failed", { supportTicketId, status, err: String(err) });
  }
}

export async function createAdjustmentRequest(
  threadId: string,
  contractorUserId: string,
  jobId: string,
  opts: {
    requestedPriceCents: number;
    contractorScopeDetails: string;
    additionalScopeDetails: string;
  },
): Promise<{ adjustmentId: string; supportTicketId: string }> {
  const scope = String(opts.contractorScopeDetails ?? "").trim();
  const additional = String(opts.additionalScopeDetails ?? "").trim();
  if (!scope) throw Object.assign(new Error("Scope details are required"), { status: 400 });
  if (!additional) throw Object.assign(new Error("Additional details are required"), { status: 400 });

  // Normalize to ensure we always have an integer cents value, even if the
  // caller sends a dollar float (e.g. 1200 instead of 120000).
  const requestedPriceCents = normalizePriceToCents(opts) || Math.round(Number(opts.requestedPriceCents));

  if (!Number.isInteger(requestedPriceCents) || requestedPriceCents <= 0) {
    throw Object.assign(new Error("Requested price must be a positive integer (cents)"), { status: 400 });
  }

  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      title: jobs.title,
      amount_cents: jobs.amount_cents,
      user_id: jobs.job_poster_user_id,
      payment_currency: jobs.payment_currency,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0];
  if (!job) throw Object.assign(new Error("Job not found"), { status: 404 });
  if (!job.user_id) throw Object.assign(new Error("Job has no poster assigned"), { status: 400 });

  if (!ALLOWED_JOB_STATUSES.includes(job.status)) {
    throw Object.assign(
      new Error(`Re-appraisal only allowed when job status is ASSIGNED (current: ${job.status})`),
      { status: 400 },
    );
  }

  // Snapshot the current job price at submission time.
  // This is stored permanently and used as the historical baseline for all
  // downstream calculations (difference, Stripe PI amount, consent page display).
  const originalPriceCents = job.amount_cents;

  // Diagnostic log — remove once pricing bugs are confirmed stable in production.
  console.info("[APPRAISAL_REQUEST_INPUT]", {
    requestedPriceCents,
    originalPriceCents,
    rawOptsValue: opts.requestedPriceCents,
    jobId,
    contractorUserId,
  });

  if (requestedPriceCents <= originalPriceCents) {
    throw Object.assign(
      new Error(
        `Requested price must exceed the current job price (requested: ${formatCents(requestedPriceCents)}, current: ${formatCents(originalPriceCents)})`,
      ),
      { status: 400 },
    );
  }

  const adjustmentId = randomUUID();
  const supportTicketId = randomUUID();
  const now = new Date();

  try {
    await db.insert(v4JobPriceAdjustments).values({
      id: adjustmentId,
      jobId,
      ...(threadId ? { threadId } : {}),
      contractorUserId,
      jobPosterUserId: job.user_id,
      supportTicketId,
      originalPriceCents,
      requestedPriceCents,
      // differenceCents intentionally omitted — computed dynamically.
      contractorScopeDetails: scope,
      additionalScopeDetails: additional,
      status: "PENDING_REVIEW",
      createdAt: now,
    });
  } catch (err: any) {
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      throw Object.assign(
        new Error("A second appraisal has already been requested for this job."),
        { status: 409 },
      );
    }
    throw err;
  }

  // Lock the job so routers cannot re-route while the appraisal is under review.
  await db.update(jobs).set({ status: "APPRAISAL_PENDING" }).where(eq(jobs.id, jobId));

  const diff = requestedPriceCents - originalPriceCents;

  await db.insert(v4SupportTickets).values({
    id: supportTicketId,
    userId: contractorUserId,
    role: "CONTRACTOR",
    subject: `2nd Appraisal Request — ${job.title}`,
    category: "SECOND_APPRAISAL",
    ticketType: "SECOND_APPRAISAL",
    priority: "HIGH",
    jobId,
    adjustmentId,
    body: `Contractor requests price adjustment from ${formatCents(originalPriceCents)} to ${formatCents(requestedPriceCents)} (difference: ${formatCents(diff)}).\n\nScope willing to do at current price:\n${scope}\n\nAdditional work required:\n${additional}`,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
  });

  if (threadId) {
    await appendSystemMessage(
      threadId,
      `Contractor submitted a 2nd appraisal request. Requested total price: ${formatCents(requestedPriceCents)}. Awaiting review from 8Fold support.`,
    );
  }

  await db.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "RE_APPRAISAL_REQUESTED",
    payload: {
      adjustmentId,
      jobId,
      contractorId: contractorUserId,
      jobPosterId: job.user_id,
      dedupeKey: `re_appraisal_requested_${adjustmentId}`,
    },
    createdAt: now,
  });

  return { adjustmentId, supportTicketId };
}

export async function getAppraisalStatusForJob(
  jobId: string,
  contractorUserId: string,
): Promise<{ exists: boolean; status: string | null }> {
  const rows = await db
    .select({ status: v4JobPriceAdjustments.status })
    .from(v4JobPriceAdjustments)
    .where(
      and(
        eq(v4JobPriceAdjustments.jobId, jobId),
        eq(v4JobPriceAdjustments.contractorUserId, contractorUserId),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? { exists: true, status: row.status } : { exists: false, status: null };
}

export async function generateConsentLink(
  adjustmentId: string,
  adminId: string,
): Promise<{ url: string; expiresAt: Date }> {
  const rows = await db
    .select()
    .from(v4JobPriceAdjustments)
    .where(eq(v4JobPriceAdjustments.id, adjustmentId))
    .limit(1);

  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });
  if (adj.status !== "PENDING_REVIEW" && adj.status !== "SENT_TO_POSTER") {
    throw Object.assign(new Error(`Cannot send to poster for adjustment in status: ${adj.status}`), { status: 400 });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db
    .update(v4JobPriceAdjustments)
    .set({
      secureToken: token,
      tokenExpiresAt: expiresAt,
      generatedByAdminId: adminId,
      generatedAt: new Date(),
      status: "SENT_TO_POSTER",
    })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  const url = `https://8fold.app/job-adjustment/${adjustmentId}?token=${token}`;

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      "8Fold has reviewed a 2nd appraisal request for this job. The Job Poster has been notified to review the revised price.",
    );
  }

  const posterRows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, adj.jobPosterUserId))
    .limit(1);

  const posterEmail = posterRows[0]?.email;
  if (posterEmail) {
    try {
      await sendAdjustmentEmail(posterEmail, adj, url);
      await logDelivery({
        notificationType: "RE_APPRAISAL_CONSENT_EMAIL",
        recipientUserId: adj.jobPosterUserId,
        recipientEmail: posterEmail,
        channel: "EMAIL",
        status: "DELIVERED",
        metadata: { adjustmentId, jobId: adj.jobId },
      });
    } catch (emailErr) {
      console.error("[APPRAISAL] Consent email send failed", { adjustmentId, err: String(emailErr) });
      await logDelivery({
        notificationType: "RE_APPRAISAL_CONSENT_EMAIL",
        recipientUserId: adj.jobPosterUserId,
        recipientEmail: posterEmail,
        channel: "EMAIL",
        status: "FAILED",
        errorMessage: String(emailErr),
        metadata: { adjustmentId, jobId: adj.jobId },
      });
    }
  }

  return { url, expiresAt };
}

export async function resendConsentEmail(adjustmentId: string): Promise<void> {
  const rows = await db
    .select()
    .from(v4JobPriceAdjustments)
    .where(eq(v4JobPriceAdjustments.id, adjustmentId))
    .limit(1);

  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });
  if (!adj.secureToken || !adj.tokenExpiresAt) {
    throw Object.assign(new Error("No consent link has been generated yet"), { status: 400 });
  }
  if (adj.tokenExpiresAt < new Date()) {
    throw Object.assign(new Error("Token expired — generate a new link"), { status: 400 });
  }

  const url = `https://8fold.app/job-adjustment/${adjustmentId}?token=${adj.secureToken}`;

  const posterRows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, adj.jobPosterUserId))
    .limit(1);

  const posterEmail = posterRows[0]?.email;
  if (!posterEmail) throw Object.assign(new Error("Job poster email not found"), { status: 404 });

  try {
    await sendAdjustmentEmail(posterEmail, adj, url);
    await logDelivery({
      notificationType: "RE_APPRAISAL_CONSENT_EMAIL",
      recipientUserId: adj.jobPosterUserId,
      recipientEmail: posterEmail,
      channel: "EMAIL",
      status: "DELIVERED",
      metadata: { adjustmentId, jobId: adj.jobId, resent: true },
    });
  } catch (emailErr) {
    console.error("[APPRAISAL] Consent email resend failed", { adjustmentId, err: String(emailErr) });
    await logDelivery({
      notificationType: "RE_APPRAISAL_CONSENT_EMAIL",
      recipientUserId: adj.jobPosterUserId,
      recipientEmail: posterEmail,
      channel: "EMAIL",
      status: "FAILED",
      errorMessage: String(emailErr),
      metadata: { adjustmentId, jobId: adj.jobId, resent: true },
    });
    throw Object.assign(new Error("Failed to resend consent email"), { status: 500 });
  }
}

async function sendAdjustmentEmail(
  to: string,
  adj: { originalPriceCents: number | null; requestedPriceCents: number },
  url: string,
): Promise<void> {
  const original = adj.originalPriceCents ?? 0;
  const diff = adj.requestedPriceCents - original;
  await sendTransactionalEmail({
    to,
    subject: "Contractor Requested a Job Price Adjustment",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 16px;">Job Price Adjustment Request</h2>
        <p>Your contractor has reported additional work required that was not included in the original job description.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;color:#64748b;">Original Price</td><td style="padding:8px 0;font-weight:700;">${formatCents(original)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Requested Price</td><td style="padding:8px 0;font-weight:700;">${formatCents(adj.requestedPriceCents)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Additional Amount</td><td style="padding:8px 0;font-weight:700;">${formatCents(diff)}</td></tr>
        </table>
        <p>Please review the request and choose whether to accept the adjustment.</p>
        <a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
          Review Re-Appraisal
        </a>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8;">This link expires in ${TOKEN_EXPIRY_HOURS} hours.</p>
      </div>
    `,
    text: `Your contractor has requested a price adjustment. Original: ${formatCents(original)}, Requested: ${formatCents(adj.requestedPriceCents)}, Additional: ${formatCents(diff)}. Review at: ${url}`,
  });
}

function validatePosterAccess(
  adj: {
    secureToken: string | null;
    tokenExpiresAt: Date | null;
    status: string;
    jobPosterUserId: string;
  },
  token: string,
  // null = token-only auth (email link flow). When null the valid token itself
  // proves ownership; no session is required. When a string, the user ID must
  // match the poster on the adjustment (session-authenticated access).
  requestingUserId: string | null,
  allowedStatuses: string[],
): void {
  if (!adj.secureToken || adj.secureToken !== token) {
    throw Object.assign(new Error("Invalid or expired link"), { status: 403 });
  }
  if (!allowedStatuses.includes(adj.status)) {
    throw Object.assign(new Error("This request has already been resolved"), { status: 400 });
  }
  if (requestingUserId !== null && adj.jobPosterUserId !== requestingUserId) {
    throw Object.assign(new Error("Access denied"), { status: 403 });
  }
}

export async function getAdjustmentForPoster(
  adjustmentId: string,
  token: string,
  requestingUserId: string | null,
): Promise<Record<string, unknown>> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  // Check token validity first — set EXPIRED and sync ticket if stale.
  if (!adj.secureToken || adj.secureToken !== token) {
    throw Object.assign(new Error("Invalid or expired link"), { status: 403 });
  }
  if (adj.tokenExpiresAt && adj.tokenExpiresAt < new Date()) {
    const wasAlreadyExpired = adj.status === "EXPIRED";
    await db
      .update(v4JobPriceAdjustments)
      .set({ status: "EXPIRED" })
      .where(eq(v4JobPriceAdjustments.id, adjustmentId));
    await syncSupportTicket(adj.supportTicketId, "CLOSED");
    // Unlock the job so it can continue under the original price.
    await db.update(jobs).set({ status: "ASSIGNED" }).where(eq(jobs.id, adj.jobId));
    if (adj.threadId && !wasAlreadyExpired) {
      await appendSystemMessage(
        adj.threadId,
        "The 2nd appraisal request expired. The job will continue under the original agreed price.",
      );
    }
    throw Object.assign(new Error("This link has expired. Please contact your contractor."), { status: 403 });
  }

  validatePosterAccess(adj, token, requestingUserId, ["SENT_TO_POSTER", "POSTER_VIEWED"]);

  const jobRows = await db
    .select({ title: jobs.title, scope: jobs.scope })
    .from(jobs)
    .where(eq(jobs.id, adj.jobId))
    .limit(1);

  const differenceCents = computeDiff(adj);

  return {
    id: adj.id,
    jobId: adj.jobId,
    jobTitle: jobRows[0]?.title ?? "",
    jobDescription: jobRows[0]?.scope ?? "",
    originalPriceCents: adj.originalPriceCents,
    requestedPriceCents: adj.requestedPriceCents,
    differenceCents,
    contractorScopeDetails: adj.contractorScopeDetails,
    additionalScopeDetails: adj.additionalScopeDetails,
    status: adj.status,
  };
}

export async function declineAdjustment(
  adjustmentId: string,
  token: string,
  requestingUserId: string | null,
): Promise<void> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  validatePosterAccess(adj, token, requestingUserId, ["SENT_TO_POSTER", "POSTER_VIEWED"]);

  await db
    .update(v4JobPriceAdjustments)
    .set({ status: "DECLINED" })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  // Unlock the job so it can proceed normally under the original price.
  await db.update(jobs).set({ status: "ASSIGNED" }).where(eq(jobs.id, adj.jobId));

  await syncSupportTicket(adj.supportTicketId, "CLOSED");

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      "The Job Poster declined the revised appraisal request. The job will continue under the original agreed price.",
    );
  }

  await db.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "RE_APPRAISAL_DECLINED",
    payload: {
      adjustmentId,
      jobId: adj.jobId,
      contractorId: adj.contractorUserId,
      jobPosterId: adj.jobPosterUserId,
      dedupeKey: `re_appraisal_declined_${adjustmentId}`,
    },
    createdAt: new Date(),
  });
}

export async function acceptAdjustment(
  adjustmentId: string,
  token: string,
  requestingUserId: string | null,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  validatePosterAccess(adj, token, requestingUserId, ["SENT_TO_POSTER", "POSTER_VIEWED"]);

  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const jobRows = await db.select({ payment_currency: jobs.payment_currency }).from(jobs).where(eq(jobs.id, adj.jobId)).limit(1);
  const currency = (jobRows[0]?.payment_currency ?? "usd") as "usd" | "cad";

  // Compute from snapshot so the Stripe charge is always exactly the agreed difference.
  const differenceCents = computeDiff(adj);
  if (differenceCents <= 0) {
    throw Object.assign(new Error("Computed price difference is not positive"), { status: 400 });
  }

  // No customer or payment_method is attached — Stripe Elements handles method
  // selection client-side via the client_secret. This avoids cus_sim / pm_sim
  // errors in test/beta environments and is correct practice for Elements flows.
  const pi = await stripe.paymentIntents.create({
    amount: differenceCents,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      adjustmentId,
      jobId: adj.jobId,
      type: "SECOND_APPRAISAL",
    },
    description: `8Fold price adjustment for job ${adj.jobId.slice(0, 8)}`,
  }, {
    idempotencyKey: `adj_accept_${adjustmentId}`,
  });

  await db
    .update(v4JobPriceAdjustments)
    .set({
      status: "PAYMENT_PENDING",
      paymentIntentId: pi.id,
    })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      "The Job Poster accepted the revised appraisal request. Processing additional payment.",
    );
  }

  return { clientSecret: pi.client_secret!, paymentIntentId: pi.id };
}

export async function confirmAdjustmentPayment(
  adjustmentId: string,
  paymentIntentId: string,
): Promise<void> {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  if (adj.status !== "PAYMENT_PENDING") {
    throw Object.assign(new Error(`Cannot confirm payment for status: ${adj.status}`), { status: 400 });
  }
  if (adj.paymentIntentId !== paymentIntentId) {
    throw Object.assign(new Error("PaymentIntent mismatch"), { status: 400 });
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") {
    throw Object.assign(new Error(`Payment not yet succeeded (status: ${pi.status})`), { status: 400 });
  }

  const now = new Date();
  const differenceCents = computeDiff(adj);

  await db
    .update(jobs)
    .set({
      amount_cents: adj.requestedPriceCents,
      price_adjustment_cents: differenceCents,
      // Restore job to ASSIGNED so normal post-payment lifecycle resumes.
      status: "ASSIGNED",
      updated_at: now,
    })
    .where(eq(jobs.id, adj.jobId));

  await db
    .update(v4JobPriceAdjustments)
    .set({ status: "PAID", approvedAt: now })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  await syncSupportTicket(adj.supportTicketId, "RESOLVED");

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      `Additional payment received. The job price has been updated to ${formatCents(adj.requestedPriceCents)}.`,
    );
  }

  await db.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "RE_APPRAISAL_ACCEPTED",
    payload: {
      adjustmentId,
      jobId: adj.jobId,
      contractorId: adj.contractorUserId,
      jobPosterId: adj.jobPosterUserId,
      dedupeKey: `re_appraisal_accepted_${adjustmentId}`,
    },
    createdAt: now,
  });
}

export async function rejectByAdmin(adjustmentId: string): Promise<void> {
  const rows = await db
    .select()
    .from(v4JobPriceAdjustments)
    .where(eq(v4JobPriceAdjustments.id, adjustmentId))
    .limit(1);

  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  await db
    .update(v4JobPriceAdjustments)
    .set({ status: "REJECTED_BY_ADMIN" })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  // Restore the job so it can continue under the original price.
  await db.update(jobs).set({ status: "ASSIGNED" }).where(eq(jobs.id, adj.jobId));

  await syncSupportTicket(adj.supportTicketId, "CLOSED");

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      "8Fold has declined the 2nd appraisal request. The job will continue under the original agreed price.",
    );
  }
}

export async function getAdjustmentByIdForAdmin(
  adjustmentId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) return null;
  const differenceCents = computeDiff(adj);
  return {
    id: adj.id,
    jobId: adj.jobId,
    threadId: adj.threadId,
    contractorUserId: adj.contractorUserId,
    jobPosterUserId: adj.jobPosterUserId,
    supportTicketId: adj.supportTicketId,
    originalPriceCents: adj.originalPriceCents,
    requestedPriceCents: adj.requestedPriceCents,
    differenceCents,
    originalPriceBreakdown: computeBreakdown(adj.originalPriceCents ?? 0),
    requestedPriceBreakdown: computeBreakdown(adj.requestedPriceCents),
    differencePriceBreakdown: computeBreakdown(differenceCents),
    contractorScopeDetails: adj.contractorScopeDetails,
    additionalScopeDetails: adj.additionalScopeDetails,
    status: adj.status,
    secureToken: adj.secureToken,
    tokenExpiresAt: adj.tokenExpiresAt?.toISOString() ?? null,
    generatedByAdminId: adj.generatedByAdminId,
    generatedAt: adj.generatedAt?.toISOString() ?? null,
    paymentIntentId: adj.paymentIntentId,
    createdAt: adj.createdAt?.toISOString() ?? null,
    approvedAt: adj.approvedAt?.toISOString() ?? null,
  };
}

export async function listAdjustmentsForContractor(contractorUserId: string): Promise<
  Array<{
    id: string;
    jobId: string;
    jobTitle: string;
    originalPriceCents: number | null;
    requestedPriceCents: number;
    differenceCents: number;
    status: string;
    createdAt: Date | null;
  }>
> {
  const rows = await db
    .select({
      id: v4JobPriceAdjustments.id,
      jobId: v4JobPriceAdjustments.jobId,
      jobTitle: jobs.title,
      originalPriceCents: v4JobPriceAdjustments.originalPriceCents,
      requestedPriceCents: v4JobPriceAdjustments.requestedPriceCents,
      status: v4JobPriceAdjustments.status,
      createdAt: v4JobPriceAdjustments.createdAt,
    })
    .from(v4JobPriceAdjustments)
    .leftJoin(jobs, eq(v4JobPriceAdjustments.jobId, jobs.id))
    .where(eq(v4JobPriceAdjustments.contractorUserId, contractorUserId))
    .orderBy(desc(v4JobPriceAdjustments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    jobId: row.jobId,
    jobTitle: row.jobTitle ?? "Unknown Job",
    originalPriceCents: row.originalPriceCents,
    requestedPriceCents: row.requestedPriceCents,
    differenceCents: computeDiff(row),
    status: row.status,
    createdAt: row.createdAt,
  }));
}
