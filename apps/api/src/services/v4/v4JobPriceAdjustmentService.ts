import { randomUUID, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { v4JobPriceAdjustments } from "@/db/schema/v4JobPriceAdjustment";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { appendSystemMessage } from "./v4MessageService";
import { sendTransactionalEmail } from "@/src/mailer/sendTransactionalEmail";
import { stripe } from "@/src/payments/stripe";

const ALLOWED_JOB_STATUSES = ["ASSIGNED"];
const TOKEN_EXPIRY_HOURS = 48;
const BLOCKING_STATUSES = [
  "PENDING",
  "SENT_TO_POSTER",
  "POSTER_VIEWED",
  "ACCEPTED_PENDING_PAYMENT",
  "PAID",
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
  if (!Number.isInteger(opts.requestedPriceCents) || opts.requestedPriceCents <= 0) {
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

  const originalPriceCents = job.amount_cents;
  const differenceCents = opts.requestedPriceCents - originalPriceCents;
  if (differenceCents <= 0) {
    throw Object.assign(new Error("Requested price must be higher than the original price"), { status: 400 });
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
      requestedPriceCents: opts.requestedPriceCents,
      differenceCents,
      contractorScopeDetails: scope,
      additionalScopeDetails: additional,
      status: "PENDING",
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
    body: `Contractor requests price adjustment from ${formatCents(originalPriceCents)} to ${formatCents(opts.requestedPriceCents)} (difference: ${formatCents(differenceCents)}).\n\nScope willing to do at current price:\n${scope}\n\nAdditional work required:\n${additional}`,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
  });

  await appendSystemMessage(
    threadId,
    "The contractor has submitted a 2nd appraisal request for this job. Admin will review the request and contact the Job Poster if an adjustment is approved.",
  );

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
  if (adj.status !== "PENDING" && adj.status !== "SENT_TO_POSTER") {
    throw Object.assign(new Error(`Cannot generate link for adjustment in status: ${adj.status}`), { status: 400 });
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

  const posterRows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, adj.jobPosterUserId))
    .limit(1);

  const posterEmail = posterRows[0]?.email;
  if (posterEmail) {
    await sendAdjustmentEmail(posterEmail, adj, url);
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

  await sendAdjustmentEmail(posterEmail, adj, url);
}

async function sendAdjustmentEmail(
  to: string,
  adj: { originalPriceCents: number; requestedPriceCents: number },
  url: string,
): Promise<void> {
  await sendTransactionalEmail({
    to,
    subject: "Contractor Requested a Job Price Adjustment",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 16px;">Job Price Adjustment Request</h2>
        <p>Your contractor has reported additional work required that was not included in the original job description.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;color:#64748b;">Original Price</td><td style="padding:8px 0;font-weight:700;">${formatCents(adj.originalPriceCents)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Re-Appraised Price</td><td style="padding:8px 0;font-weight:700;">${formatCents(adj.requestedPriceCents)}</td></tr>
        </table>
        <p>Please review the request and choose whether to accept the adjustment.</p>
        <a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
          Review Re-Appraisal
        </a>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8;">This link expires in 48 hours.</p>
      </div>
    `,
    text: `Your contractor has requested a price adjustment. Original: ${formatCents(adj.originalPriceCents)}, Requested: ${formatCents(adj.requestedPriceCents)}. Review at: ${url}`,
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
  requestingUserId: string,
  allowedStatuses: string[],
): void {
  if (!adj.secureToken || adj.secureToken !== token) {
    throw Object.assign(new Error("Invalid or expired link"), { status: 403 });
  }
  if (!adj.tokenExpiresAt || adj.tokenExpiresAt < new Date()) {
    throw Object.assign(new Error("This link has expired"), { status: 403 });
  }
  if (!allowedStatuses.includes(adj.status)) {
    throw Object.assign(new Error("This request has already been resolved"), { status: 400 });
  }
  if (adj.jobPosterUserId !== requestingUserId) {
    throw Object.assign(new Error("Access denied"), { status: 403 });
  }
}

export async function getAdjustmentForPoster(
  adjustmentId: string,
  token: string,
  requestingUserId: string,
): Promise<Record<string, unknown>> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  validatePosterAccess(adj, token, requestingUserId, ["SENT_TO_POSTER", "POSTER_VIEWED"]);

  if (adj.status === "SENT_TO_POSTER") {
    await db.update(v4JobPriceAdjustments).set({ status: "POSTER_VIEWED" }).where(eq(v4JobPriceAdjustments.id, adjustmentId));
  }

  const jobRows = await db
    .select({ title: jobs.title, scope: jobs.scope })
    .from(jobs)
    .where(eq(jobs.id, adj.jobId))
    .limit(1);

  return {
    id: adj.id,
    jobId: adj.jobId,
    jobTitle: jobRows[0]?.title ?? "",
    jobDescription: jobRows[0]?.scope ?? "",
    originalPriceCents: adj.originalPriceCents,
    requestedPriceCents: adj.requestedPriceCents,
    differenceCents: adj.differenceCents,
    contractorScopeDetails: adj.contractorScopeDetails,
    additionalScopeDetails: adj.additionalScopeDetails,
    status: adj.status === "SENT_TO_POSTER" ? "POSTER_VIEWED" : adj.status,
  };
}

export async function declineAdjustment(
  adjustmentId: string,
  token: string,
  requestingUserId: string,
): Promise<void> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  validatePosterAccess(adj, token, requestingUserId, ["SENT_TO_POSTER", "POSTER_VIEWED"]);

  await db
    .update(v4JobPriceAdjustments)
    .set({ status: "DECLINED" })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      "The Job Poster has declined the contractor's re-appraisal request. The job will proceed under the original agreed price.",
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
  requestingUserId: string,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  validatePosterAccess(adj, token, requestingUserId, ["SENT_TO_POSTER", "POSTER_VIEWED"]);

  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const userRows = await db
    .select({ stripeCustomerId: users.stripeCustomerId, stripeDefaultPaymentMethodId: users.stripeDefaultPaymentMethodId })
    .from(users)
    .where(eq(users.id, adj.jobPosterUserId))
    .limit(1);

  const poster = userRows[0];
  if (!poster?.stripeCustomerId) {
    throw Object.assign(new Error("Job poster has no Stripe customer on file"), { status: 400 });
  }

  const jobRows = await db.select({ payment_currency: jobs.payment_currency }).from(jobs).where(eq(jobs.id, adj.jobId)).limit(1);
  const currency = (jobRows[0]?.payment_currency ?? "cad") as "usd" | "cad";

  const pi = await stripe.paymentIntents.create({
    amount: adj.differenceCents,
    currency,
    customer: poster.stripeCustomerId,
    metadata: {
      adjustmentId,
      jobId: adj.jobId,
      type: "price_adjustment",
    },
    description: `8Fold price adjustment for job ${adj.jobId.slice(0, 8)}`,
    automatic_payment_methods: { enabled: true },
    ...(poster.stripeDefaultPaymentMethodId ? { payment_method: poster.stripeDefaultPaymentMethodId } : {}),
  }, {
    idempotencyKey: `adj_accept_${adjustmentId}`,
  });

  await db
    .update(v4JobPriceAdjustments)
    .set({
      status: "ACCEPTED_PENDING_PAYMENT",
      paymentIntentId: pi.id,
    })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

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

  if (adj.status !== "ACCEPTED_PENDING_PAYMENT") {
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

  await db
    .update(jobs)
    .set({
      amount_cents: adj.requestedPriceCents,
      price_adjustment_cents: adj.differenceCents,
      updated_at: now,
    })
    .where(eq(jobs.id, adj.jobId));

  await db
    .update(v4JobPriceAdjustments)
    .set({ status: "PAID", approvedAt: now })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));

  if (adj.threadId) {
    await appendSystemMessage(
      adj.threadId,
      `The Job Poster has accepted the re-appraisal. Original price: ${formatCents(adj.originalPriceCents)} → New price: ${formatCents(adj.requestedPriceCents)}. Additional payment processed successfully.`,
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
    .select({ status: v4JobPriceAdjustments.status })
    .from(v4JobPriceAdjustments)
    .where(eq(v4JobPriceAdjustments.id, adjustmentId))
    .limit(1);

  if (!rows[0]) throw Object.assign(new Error("Adjustment not found"), { status: 404 });

  await db
    .update(v4JobPriceAdjustments)
    .set({ status: "REJECTED_BY_ADMIN" })
    .where(eq(v4JobPriceAdjustments.id, adjustmentId));
}

export async function getAdjustmentByIdForAdmin(
  adjustmentId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(v4JobPriceAdjustments).where(eq(v4JobPriceAdjustments.id, adjustmentId)).limit(1);
  const adj = rows[0];
  if (!adj) return null;
  return {
    id: adj.id,
    jobId: adj.jobId,
    threadId: adj.threadId,
    contractorUserId: adj.contractorUserId,
    jobPosterUserId: adj.jobPosterUserId,
    supportTicketId: adj.supportTicketId,
    originalPriceCents: adj.originalPriceCents,
    requestedPriceCents: adj.requestedPriceCents,
    differenceCents: adj.differenceCents,
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
