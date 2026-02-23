import { createPaymentIntent, verifyPaymentIntent } from "./stripe";
import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { getResolvedSchema } from "@/server/db/schemaLock";
import { auditLogs } from "../../db/schema/auditLog";
import { materialsEscrows } from "../../db/schema/materialsEscrow";
import { materialsEscrowLedgerEntries } from "../../db/schema/materialsEscrowLedgerEntry";
import { materialsPayments } from "../../db/schema/materialsPayment";
import { materialsRequests } from "../../db/schema/materialsRequest";

function idempotencyKeyForMaterials(requestId: string, amountCents: number) {
  return `materials_${requestId}_amount_${amountCents}`;
}

export async function createMaterialsPaymentIntent(requestId: string) {
  const reqRows = await db
    .select({
      id: materialsRequests.id,
      status: materialsRequests.status,
      currency: materialsRequests.currency,
      totalAmountCents: materialsRequests.totalAmountCents,
      jobId: materialsRequests.jobId,
      jobPosterUserId: materialsRequests.jobPosterUserId,
    })
    .from(materialsRequests)
    .where(eq(materialsRequests.id, requestId))
    .limit(1);
  const req = reqRows[0] ?? null;
  if (!req) throw Object.assign(new Error("Materials request not found"), { status: 404 });
  if (req.status !== "SUBMITTED") {
    throw Object.assign(new Error("Materials request must be SUBMITTED to approve & pay"), { status: 409 });
  }

  const amountCents = req.totalAmountCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error("Invalid materials total"), { status: 400 });
  }

  const idempotencyKey = idempotencyKeyForMaterials(req.id, amountCents);
  const pi = await createPaymentIntent(amountCents, {
    currency: String(req.currency) === "CAD" ? "cad" : "usd",
    idempotencyKey,
    metadata: {
      amountType: "materials_escrow",
      materialsRequestId: req.id,
      jobId: req.jobId,
      jobPosterUserId: req.jobPosterUserId
    }
  });

  const now = new Date();
  const paymentRows = await db
    .insert(materialsPayments)
    .values({
      id: crypto.randomUUID(),
      requestId: req.id,
      stripePaymentIntentId: pi.paymentIntentId,
      stripePaymentIntentStatus: pi.status,
      status: "PENDING",
      amountCents,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: [materialsPayments.requestId],
      set: {
        stripePaymentIntentId: pi.paymentIntentId,
        stripePaymentIntentStatus: pi.status,
        status: "PENDING",
        amountCents,
        updatedAt: now,
      } as any,
    })
    .returning({
      stripePaymentIntentId: materialsPayments.stripePaymentIntentId,
      stripePaymentIntentStatus: materialsPayments.stripePaymentIntentStatus,
      amountCents: materialsPayments.amountCents,
    });
  const payment = paymentRows[0] as any;

  return {
    clientSecret: pi.clientSecret,
    paymentIntentId: payment.stripePaymentIntentId,
    stripeStatus: payment.stripePaymentIntentStatus,
    amountCents: payment.amountCents
  };
}

export async function confirmMaterialsPayment(requestId: string, paymentIntentId: string, actorUserId: string) {
  const payRows = await db
    .select({
      id: materialsPayments.id,
      stripePaymentIntentId: materialsPayments.stripePaymentIntentId,
      stripePaymentIntentStatus: materialsPayments.stripePaymentIntentStatus,
      stripeChargeId: materialsPayments.stripeChargeId,
      status: materialsPayments.status,
      amountCents: materialsPayments.amountCents,
    })
    .from(materialsPayments)
    .where(eq(materialsPayments.requestId, requestId))
    .limit(1);
  const payment = payRows[0] ?? null;
  if (!payment) throw Object.assign(new Error("Materials payment record not found"), { status: 404 });
  if (payment.stripePaymentIntentId !== paymentIntentId) {
    throw Object.assign(new Error("Payment intent mismatch"), { status: 400 });
  }
  if (payment.status === "CAPTURED") {
    return { ok: true as const };
  }

  const verified = await verifyPaymentIntent(paymentIntentId);
  const now = new Date();

  // Dev-mode Stripe stub returns amount=0; treat it as "unknown" and defer to our stored amount.
  const verifiedAmount =
    verified.amount === 0 && String(paymentIntentId).startsWith("dev_pi_") ? payment.amountCents : verified.amount;

  if (verified.status !== "succeeded") {
    await db
      .update(materialsPayments)
      .set({
        stripePaymentIntentStatus: verified.status,
        status: verified.status === "canceled" ? ("FAILED" as any) : ("PENDING" as any),
        updatedAt: now,
      } as any)
      .where(eq(materialsPayments.requestId, requestId));
    throw Object.assign(new Error("Payment not completed"), { status: 409 });
  }

  const schema = getResolvedSchema();
  const materialsPaymentT = sql.raw(`"${schema}"."MaterialsPayment"`);
  const materialsRequestT = sql.raw(`"${schema}"."MaterialsRequest"`);
  await db.transaction(async (tx) => {
    // Lock payment + request rows so deposit is written once.
    await tx.execute(
      sql`select "id" from ${materialsPaymentT} where "requestId" = ${requestId} for update`,
    );
    await tx.execute(sql`select "id" from ${materialsRequestT} where "id" = ${requestId} for update`);

    const reqRows = await tx
      .select({
        id: materialsRequests.id,
        status: materialsRequests.status,
        approvedAt: materialsRequests.approvedAt,
        jobId: materialsRequests.jobId,
        currency: materialsRequests.currency,
        totalAmountCents: materialsRequests.totalAmountCents,
        jobPosterUserId: materialsRequests.jobPosterUserId,
      })
      .from(materialsRequests)
      .where(eq(materialsRequests.id, requestId))
      .limit(1);
    const req = reqRows[0] ?? null;
    if (!req) throw Object.assign(new Error("Materials request not found"), { status: 404 });
    if (req.status !== "SUBMITTED" && req.status !== "APPROVED") {
      throw Object.assign(new Error("Materials request is not eligible for funding"), { status: 409 });
    }

    if (verifiedAmount !== req.totalAmountCents) {
      throw Object.assign(new Error("Stripe amount mismatch"), { status: 409 });
    }

    // Mark as approved + escrowed (locked until receipts + reimbursement release).
    await tx
      .update(materialsRequests)
      .set({
        status: "ESCROWED",
        approvedAt: req.status === "APPROVED" ? req.approvedAt : now,
        approvedByUserId: actorUserId,
        updatedAt: now,
      } as any)
      .where(eq(materialsRequests.id, req.id));

    // Idempotent escrow create (unique on requestId).
    const insertedEscrow = await tx
      .insert(materialsEscrows)
      .values({
        id: crypto.randomUUID(),
        requestId: req.id,
        status: "HELD",
        currency: req.currency as any,
        amountCents: req.totalAmountCents,
        releaseDueAt: null,
      } as any)
      .onConflictDoNothing({ target: [materialsEscrows.requestId] })
      .returning({ id: materialsEscrows.id });

    const escrowId =
      insertedEscrow[0]?.id ??
      (
        await tx
          .select({ id: materialsEscrows.id })
          .from(materialsEscrows)
          .where(eq(materialsEscrows.requestId, req.id))
          .limit(1)
      )[0]?.id;
    if (!escrowId) throw new Error("Failed to resolve materials escrow id");

    // Idempotency: only one DEPOSIT ledger entry per escrow.
    const existingDeposit = await tx
      .select({ id: materialsEscrowLedgerEntries.id })
      .from(materialsEscrowLedgerEntries)
      .where(and(eq(materialsEscrowLedgerEntries.escrowId, escrowId), eq(materialsEscrowLedgerEntries.type, "DEPOSIT")))
      .limit(1);
    if (!existingDeposit[0]?.id) {
      await tx.insert(materialsEscrowLedgerEntries).values({
        id: crypto.randomUUID(),
        escrowId,
        type: "DEPOSIT",
        amountCents: req.totalAmountCents,
        currency: req.currency as any,
        actorUserId,
        memo: "Materials escrow deposit (Stripe captured)",
      } as any);
    }

    // Mark payment captured (idempotent).
    await tx
      .update(materialsPayments)
      .set({
        stripePaymentIntentStatus: verified.status,
        stripeChargeId: verified.latestChargeId,
        status: "CAPTURED",
        capturedAt: now,
        updatedAt: now,
      } as any)
      .where(eq(materialsPayments.requestId, requestId));

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId,
      action: "MATERIALS_ESCROW_FUNDED",
      entityType: "MaterialsRequest",
      entityId: req.id,
      metadata: { jobId: req.jobId, amountCents: req.totalAmountCents, paymentIntentId } as any,
    });
  });

  return { ok: true as const };
}

