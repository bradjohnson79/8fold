import dotenv from "dotenv";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { and, eq } from "drizzle-orm";
import { calculatePayoutBreakdown } from "@8fold/shared";
import { db } from "../db/drizzle";
import { jobs } from "../db/schema/job";
import { jobPayments } from "../db/schema/jobPayment";
import { escrows } from "../db/schema/escrow";
import { createPaymentIntent } from "../src/payments/stripe";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDir, "..", ".env.local") });

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const checks: Check[] = [];
  const runId = `stripe-flow-${Date.now()}`;
  const jobId = randomUUID();
  const posterId = `test-job-poster-${randomUUID()}`;
  const now = new Date();

  const laborTotalCents = 25_000;
  const materialsTotalCents = 3_000;
  const breakdown = calculatePayoutBreakdown(laborTotalCents, materialsTotalCents);
  const amountCents = breakdown.totalJobPosterPaysCents;
  const currency = "cad" as const;

  try {
    await db.insert(jobs).values({
      id: jobId,
      title: `Stripe Funding Test ${runId}`,
      scope: "Test scope",
      region: "test-region",
      jobType: "regional",
      status: "DRAFT",
      country: "CA",
      paymentCurrency: currency,
      laborTotalCents,
      materialsTotalCents,
      amountCents,
      jobPosterUserId: posterId,
      createdAt: now,
      updatedAt: now,
    } as any);
    checks.push({ name: "create test job", ok: true, detail: jobId });

    const pi = await createPaymentIntent(amountCents, {
      currency,
      idempotencyKey: `test_${jobId}_${amountCents}`,
      captureMethod: "automatic",
      confirmationMethod: "automatic",
      description: `8Fold Job Escrow - ${jobId}`,
      metadata: {
        type: "job_escrow",
        jobId,
        jobPosterUserId: posterId,
      },
    });
    checks.push({ name: "create payment intent", ok: Boolean(pi.clientSecret), detail: pi.paymentIntentId });

    await db.insert(jobPayments).values({
      id: randomUUID(),
      jobId,
      stripePaymentIntentId: pi.paymentIntentId,
      stripePaymentIntentStatus: pi.status,
      amountCents,
      status: "PENDING",
      updatedAt: new Date(),
    } as any);

    // Simulate `payment_intent.succeeded` effects from webhook handler.
    await db.transaction(async (tx) => {
      await tx
        .update(jobPayments)
        .set({
          stripePaymentIntentStatus: "succeeded",
          status: "CAPTURED",
          escrowLockedAt: now,
          paymentCapturedAt: now,
          updatedAt: now,
        } as any)
        .where(eq(jobPayments.jobId, jobId));

      await tx
        .update(jobs)
        .set({
          payment_status: "FUNDED",
          funded_at: now,
          stripe_payment_intent_id: pi.paymentIntentId,
          status: "OPEN_FOR_ROUTING",
          escrow_locked_at: now,
          payment_captured_at: now,
          updated_at: now,
        })
        .where(eq(jobs.id, jobId));

      const existingEscrow = await tx
        .select({ id: escrows.id })
        .from(escrows)
        .where(and(eq(escrows.jobId, jobId), eq(escrows.kind, "JOB_ESCROW" as any)))
        .limit(1);
      if (!existingEscrow[0]?.id) {
        await tx.insert(escrows).values({
          jobId,
          kind: "JOB_ESCROW",
          amountCents,
          currency: "CAD",
          status: "FUNDED",
          stripePaymentIntentId: pi.paymentIntentId,
          webhookProcessedAt: now,
          updatedAt: now,
        } as any);
      }
    });
    checks.push({ name: "simulate payment_intent.succeeded", ok: true });

    const fundedJob = await db
      .select({
        status: jobs.status,
        paymentStatus: jobs.payment_status,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    checks.push({
      name: "job funded",
      ok: String(fundedJob[0]?.paymentStatus ?? "") === "FUNDED" && String(fundedJob[0]?.status ?? "") === "OPEN_FOR_ROUTING",
      detail: JSON.stringify(fundedJob[0] ?? {}),
    });

    const payment = await db
      .select({ status: jobPayments.status })
      .from(jobPayments)
      .where(eq(jobPayments.jobId, jobId))
      .limit(1);
    checks.push({
      name: "job payment captured",
      ok: String(payment[0]?.status ?? "") === "CAPTURED",
      detail: String(payment[0]?.status ?? ""),
    });

    const escrow = await db
      .select({ id: escrows.id, status: escrows.status })
      .from(escrows)
      .where(and(eq(escrows.jobId, jobId), eq(escrows.kind, "JOB_ESCROW" as any)))
      .limit(1);
    checks.push({
      name: "escrow exists",
      ok: Boolean(escrow[0]?.id) && String(escrow[0]?.status ?? "") === "FUNDED",
      detail: escrow[0]?.id ?? "missing",
    });
  } catch (err) {
    checks.push({
      name: "unexpected error",
      ok: false,
      detail: err instanceof Error ? err.message : "unknown",
    });
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    const icon = c.ok ? "PASS" : "FAIL";
    console.log(`${icon} - ${c.name}${c.detail ? ` :: ${c.detail}` : ""}`);
  }
  if (failed.length > 0) {
    console.error(`\nFAIL SUMMARY: ${failed.length} checks failed`);
    process.exit(1);
  }
  console.log("\nPASS SUMMARY: Stripe funding flow simulation passed");
}

void main();
