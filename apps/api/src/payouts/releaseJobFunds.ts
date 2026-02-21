import Stripe from "stripe";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { stripe } from "@/src/stripe/stripe";
import { jobs } from "@/db/schema/job";
import { jobAssignments } from "@/db/schema/jobAssignment";
import { contractors } from "@/db/schema/contractor";
import { users } from "@/db/schema/user";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { transferRecords } from "@/db/schema/transferRecord";
import { escrows } from "@/db/schema/escrow";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { jobPayments } from "@/db/schema/jobPayment";
import { isCompletionReady } from "@/src/utils/isCompletionReady";
import { getOrCreatePlatformUserId } from "@/src/system/platformUser";
import { getStripeModeFromEnv } from "@/src/stripe/mode";
import { isRefundInitiatedOrCompleteJobPayment } from "./releaseSafetyGuards";

type RoleLeg = "CONTRACTOR" | "ROUTER" | "PLATFORM";
type Method = "STRIPE";
type Status = "PENDING" | "SENT" | "FAILED" | "REVERSED";

export type ReleaseLegResult =
  | { role: RoleLeg; method: Method; status: "SENT"; amountCents: number; currency: "USD" | "CAD"; stripeTransferId?: string | null; externalRef?: string | null }
  | { role: RoleLeg; method: Method; status: "FAILED"; amountCents: number; currency: "USD" | "CAD"; failureReason: string };

export type ReleaseJobFundsResult =
  | { ok: true; jobId: string; alreadyReleased: boolean; legs: ReleaseLegResult[] }
  | { ok: false; jobId: string; error: string; code: string };

function requireStripe(): Stripe {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500, code: "STRIPE_NOT_CONFIGURED" });
  return stripe;
}

function toCurrencyCode(job: { country?: string | null; currency?: string | null }): "USD" | "CAD" {
  const c = String(job.currency ?? "").toUpperCase();
  if (c === "CAD" || c === "USD") return c as any;
  const country = String(job.country ?? "").toUpperCase();
  return country === "CA" ? "CAD" : "USD";
}

function toStripeCurrency(currency: "USD" | "CAD"): "usd" | "cad" {
  return currency === "CAD" ? "cad" : "usd";
}

const SYSTEM_ESCROW_USER_ID = "system:escrow";

function splitCents(total: number): { contractor: number; router: number; platform: number } {
  const t = Number(total ?? 0);
  if (!Number.isInteger(t) || t <= 0) throw Object.assign(new Error("Invalid total cents"), { status: 400, code: "BAD_TOTAL" });
  const contractor = Math.floor(t * 0.75);
  const router = Math.floor(t * 0.15);
  const platform = t - contractor - router;
  if (contractor < 0 || router < 0 || platform < 0) throw Object.assign(new Error("Invalid split"), { status: 500, code: "SPLIT_INVALID" });
  if (contractor + router + platform !== t) throw Object.assign(new Error("Split mismatch"), { status: 500, code: "SPLIT_MISMATCH" });
  return { contractor, router, platform };
}

async function resolveContractorUserIdInTx(tx: any, jobId: string, current: string | null): Promise<string | null> {
  const direct = String(current ?? "").trim();
  if (direct) return direct;

  const assignRows = await tx
    .select({ contractorId: jobAssignments.contractorId })
    .from(jobAssignments)
    .where(eq(jobAssignments.jobId, jobId))
    .limit(1);
  const contractorId = assignRows[0]?.contractorId ?? null;
  if (!contractorId) return null;

  const contractorRows = await tx
    .select({ email: contractors.email })
    .from(contractors)
    .where(eq(contractors.id, String(contractorId)))
    .limit(1);
  const email = contractorRows[0]?.email ?? null;
  if (!email) return null;

  const userRows = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return userRows[0]?.id ?? null;
}

async function payoutMethodForUserInTx(
  tx: any,
  userId: string,
  currency: "USD" | "CAD",
  kind: "router" | "contractor",
): Promise<Method> {
  if (kind === "router") {
    const rows = await tx
      .select({ provider: payoutMethods.provider })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.currency, currency as any), eq(payoutMethods.isActive, true)))
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1);
    const provider = String(rows[0]?.provider ?? "").toUpperCase();
    if (provider && provider !== "STRIPE") {
      throw Object.assign(new Error("Router payout provider must be STRIPE"), { status: 409, code: "ROUTER_PROVIDER_NOT_STRIPE" });
    }
    return "STRIPE";
  }

  const rows = await tx
    .select({ payoutMethod: contractorAccounts.payoutMethod })
    .from(contractorAccounts)
    .where(eq(contractorAccounts.userId, userId))
    .limit(1);
  const pm = String(rows[0]?.payoutMethod ?? "").toUpperCase();
  if (pm && pm !== "STRIPE") {
    throw Object.assign(new Error("Contractor payout provider must be STRIPE"), { status: 409, code: "CONTRACTOR_PROVIDER_NOT_STRIPE" });
  }
  return "STRIPE";
}

async function stripeDestinationForLegInTx(
  tx: any,
  input: { jobId: string; role: "ROUTER" | "CONTRACTOR"; userId: string; currency: "USD" | "CAD" },
) {
  const { jobId, role, userId, currency } = input;
  if (role === "ROUTER") {
    const rows = await tx
      .select({
        stripeAccountId: sql<string | null>`${payoutMethods.details} ->> 'stripeAccountId'`,
        payoutsEnabled: sql<boolean>`coalesce((${payoutMethods.details} ->> 'stripePayoutsEnabled')::boolean, false)`,
      })
      .from(payoutMethods)
      .where(
        and(
          eq(payoutMethods.userId, userId),
          eq(payoutMethods.currency, currency as any),
          eq(payoutMethods.provider, "STRIPE" as any),
          eq(payoutMethods.isActive, true),
        ),
      )
      .orderBy(desc(payoutMethods.createdAt))
      .limit(1);
    const acct = String(rows[0]?.stripeAccountId ?? "").trim();
    const enabled = Boolean(rows[0]?.payoutsEnabled);
    if (!acct) throw Object.assign(new Error("Router missing stripeAccountId"), { status: 409, code: "ROUTER_STRIPE_MISSING" });
    if (!enabled) throw Object.assign(new Error("Router Stripe payouts not enabled"), { status: 409, code: "ROUTER_PAYOUTS_DISABLED" });
    return acct;
  }

  // Contractors: canonical payouts-enabled flag lives on Contractor table (webhook updates it).
  const contractorIdRows = await tx
    .select({ contractorId: jobAssignments.contractorId })
    .from(jobAssignments)
    .where(eq(jobAssignments.jobId, jobId))
    .limit(1);
  const contractorId = contractorIdRows[0]?.contractorId ?? null;
  if (!contractorId) throw Object.assign(new Error("Missing contractor assignment"), { status: 409, code: "NO_ASSIGNMENT" });

  const rows = await tx
    .select({ stripeAccountId: contractors.stripeAccountId, payoutsEnabled: contractors.stripePayoutsEnabled })
    .from(contractors)
    .where(eq(contractors.id, String(contractorId)))
    .limit(1);
  const acct = String(rows[0]?.stripeAccountId ?? "").trim();
  const enabled = Boolean(rows[0]?.payoutsEnabled);
  if (!acct) throw Object.assign(new Error("Contractor missing stripeAccountId"), { status: 409, code: "CONTRACTOR_STRIPE_MISSING" });
  if (!enabled) throw Object.assign(new Error("Contractor Stripe payouts not enabled"), { status: 409, code: "CONTRACTOR_PAYOUTS_DISABLED" });
  return acct;
}

async function ensureLedgerEvidenceInTx(tx: any, input: {
  userId: string;
  jobId: string;
  amountCents: number;
  currency: "USD" | "CAD";
  bucket: "AVAILABLE" | "PAID";
  stripeRef: string | null;
  memo: string;
  type?: "PAYOUT" | "BROKER_FEE";
}) {
  const ref = input.stripeRef ? String(input.stripeRef) : null;
  const type = input.type ?? "PAYOUT";
  // Idempotency: one ledger evidence row per (userId, jobId, bucket, amount, stripeRef).
  const existing = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, input.userId),
        eq(ledgerEntries.jobId, input.jobId),
        eq(ledgerEntries.type, type as any),
        eq(ledgerEntries.direction, "CREDIT" as any),
        eq(ledgerEntries.bucket, input.bucket as any),
        eq(ledgerEntries.amountCents, input.amountCents),
        ref ? eq(ledgerEntries.stripeRef, ref) : isNull(ledgerEntries.stripeRef),
      ),
    )
    .limit(1);
  if (existing[0]?.id) return;

  await tx.insert(ledgerEntries).values({
    userId: input.userId,
    jobId: input.jobId,
    type: type as any,
    direction: "CREDIT" as any,
    bucket: input.bucket as any,
    amountCents: input.amountCents,
    currency: input.currency as any,
    stripeRef: ref,
    memo: input.memo,
  } as any);
}

export async function releaseJobFunds(input: {
  jobId: string;
  triggeredByUserId: string;
}): Promise<ReleaseJobFundsResult> {
  const jobId = String(input.jobId ?? "").trim();
  const triggeredByUserId = String(input.triggeredByUserId ?? "").trim();
  if (!jobId) return { ok: false, jobId: "", error: "Missing jobId", code: "MISSING_JOB_ID" };
  if (!triggeredByUserId) return { ok: false, jobId, error: "Missing triggeredByUserId", code: "MISSING_ACTOR" };

  const s = requireStripe();
  const now = new Date();
  const stripeMode = getStripeModeFromEnv();

  // Stripe calls are network-bound; keep DB transactions tight. We do a lock/read, then execute legs,
  // then persist results under lock again. Idempotency is enforced by TransferRecord unique(jobId,role).
  const snapshot = await db.transaction(async (tx: any) => {
    await tx.execute(sql`select "id" from "8fold_test"."Job" where "id" = ${jobId} for update`);

    const rows = await tx
      .select({
        id: jobs.id,
        archived: jobs.archived,
        isMock: jobs.isMock,
        status: jobs.status,
        paymentStatus: jobs.paymentStatus,
        payoutStatus: jobs.payoutStatus,
        amountCents: jobs.amountCents,
        country: jobs.country,
        currency: jobs.currency,
        stripePaymentIntentId: jobs.stripePaymentIntentId,
        claimedByUserId: jobs.claimedByUserId,
        contractorUserId: jobs.contractorUserId,
        contractorCompletedAt: jobs.contractorCompletedAt,
        customerApprovedAt: jobs.customerApprovedAt,
        routerApprovedAt: jobs.routerApprovedAt,
        contractorTransferId: jobs.contractorTransferId,
        routerTransferId: jobs.routerTransferId,
        releasedAt: jobs.releasedAt,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = rows[0] ?? null;
    if (!job) return { kind: "not_found" as const };
    if (job.archived) return { kind: "archived" as const };
    if (job.isMock) return { kind: "mock" as const };
    if (String(job.status ?? "") === "DISPUTED") return { kind: "disputed" as const };
    if (String(job.status ?? "") === "COMPLETION_FLAGGED") return { kind: "not_ready" as const };

    const paymentStatus = String(job.paymentStatus ?? "");
    if (!["FUNDED", "FUNDS_SECURED"].includes(paymentStatus)) {
      return { kind: "not_funded" as const, paymentStatus };
    }

    // Refuse release if refund has been initiated/completed (no clawback exists).
    const jpRows = await tx
      .select({ status: jobPayments.status, refundedAt: jobPayments.refundedAt, refundIssuedAt: jobPayments.refundIssuedAt })
      .from(jobPayments)
      .where(eq(jobPayments.jobId, jobId))
      .limit(1);
    const jp = jpRows[0] ?? null;
    const jpStatus = String(jp?.status ?? "").toUpperCase();
    const refundGuard = isRefundInitiatedOrCompleteJobPayment({ status: jpStatus, refundedAt: jp?.refundedAt ?? null, refundIssuedAt: jp?.refundIssuedAt ?? null });
    if (refundGuard.blocked) return { kind: "refund_initiated" as const, jobPaymentStatus: jpStatus || null };

    if (!isCompletionReady(job as any)) return { kind: "not_ready" as const };
    const routerUserId = String(job.claimedByUserId ?? "").trim();
    if (!routerUserId) return { kind: "missing_router" as const };

    const contractorUserId = await resolveContractorUserIdInTx(tx, jobId, job.contractorUserId ?? null);
    if (!contractorUserId) return { kind: "missing_contractor" as const };

    const currency = toCurrencyCode(job as any);
    const totalCents = Number(job.amountCents ?? 0);
    const split = splitCents(totalCents);

    const platformUserId = await getOrCreatePlatformUserId(tx as any);

    // Fetch existing transfer records (idempotency).
    const existing = await tx
      .select({
        id: transferRecords.id,
        role: transferRecords.role,
        method: transferRecords.method,
        status: transferRecords.status,
        stripeTransferId: transferRecords.stripeTransferId,
        externalRef: transferRecords.externalRef,
        amountCents: transferRecords.amountCents,
        currency: transferRecords.currency,
        failureReason: transferRecords.failureReason,
      })
      .from(transferRecords)
      .where(eq(transferRecords.jobId, jobId));

    // Defensive guardrails: never attempt release when a leg is FAILED/REVERSED; this prevents retries from
    // silently mixing states and ensures ops must investigate before more money moves.
    for (const r of existing ?? []) {
      const st = String(r.status ?? "").toUpperCase();
      if (st === "FAILED" || st === "REVERSED") {
        return {
          kind: "blocked_by_leg_status" as const,
          role: String(r.role ?? ""),
          status: st,
          transferRecordId: String(r.id ?? ""),
          stripeTransferId: r.stripeTransferId ?? null,
        };
      }
    }

    // Validate that any existing legs match the expected 3-leg invariant for this job amount/currency.
    const expectedByRole: Record<string, number> = { CONTRACTOR: split.contractor, ROUTER: split.router, PLATFORM: split.platform };
    const seen: Record<string, number> = {};
    for (const r of existing ?? []) {
      const role = String(r.role ?? "").toUpperCase();
      seen[role] = (seen[role] ?? 0) + 1;
      if (!(role in expectedByRole)) {
        return { kind: "unexpected_leg_role" as const, role, transferRecordId: String(r.id ?? "") };
      }
      if (Number(r.amountCents ?? 0) !== Number(expectedByRole[role] ?? 0)) {
        return {
          kind: "existing_leg_amount_mismatch" as const,
          role,
          expectedAmountCents: Number(expectedByRole[role] ?? 0),
          actualAmountCents: Number(r.amountCents ?? 0),
          transferRecordId: String(r.id ?? ""),
        };
      }
      if (String(r.currency ?? "").toUpperCase() !== String(currency).toUpperCase()) {
        return {
          kind: "existing_leg_currency_mismatch" as const,
          role,
          expectedCurrency: currency,
          actualCurrency: String(r.currency ?? ""),
          transferRecordId: String(r.id ?? ""),
        };
      }
    }
    for (const [role, count] of Object.entries(seen)) {
      if (count > 1) return { kind: "duplicate_leg_role" as const, role, count };
    }

    return {
      kind: "ok" as const,
      job,
      routerUserId,
      contractorUserId,
      platformUserId,
      currency,
      split,
      existing,
    };
  });

  if (snapshot.kind !== "ok") {
    const code =
      snapshot.kind === "not_found"
        ? "JOB_NOT_FOUND"
        : snapshot.kind === "archived"
          ? "JOB_ARCHIVED"
          : snapshot.kind === "mock"
            ? "JOB_MOCK"
            : snapshot.kind === "disputed"
              ? "JOB_DISPUTED"
              : snapshot.kind === "not_funded"
                ? "ESCROW_NOT_FUNDED"
                : snapshot.kind === "not_ready"
                  ? "JOB_NOT_READY"
                  : snapshot.kind === "missing_router"
                    ? "MISSING_ROUTER"
                    : snapshot.kind === "refund_initiated"
                      ? "REFUND_INITIATED"
                    : snapshot.kind === "blocked_by_leg_status"
                      ? "TRANSFER_LEG_BLOCKED"
                      : snapshot.kind === "unexpected_leg_role"
                        ? "TRANSFER_LEG_ROLE_INVALID"
                        : snapshot.kind === "duplicate_leg_role"
                          ? "TRANSFER_LEG_ROLE_DUPLICATE"
                          : snapshot.kind === "existing_leg_amount_mismatch"
                            ? "TRANSFER_LEG_AMOUNT_MISMATCH"
                            : snapshot.kind === "existing_leg_currency_mismatch"
                              ? "TRANSFER_LEG_CURRENCY_MISMATCH"
                              : "MISSING_CONTRACTOR";
    const msg =
      snapshot.kind === "not_funded"
        ? `Job not funded (paymentStatus=${(snapshot as any).paymentStatus})`
        : snapshot.kind === "not_ready"
          ? "Job is not completion-ready"
          : snapshot.kind === "missing_router"
            ? "Job missing router"
            : snapshot.kind === "missing_contractor"
              ? "Job missing contractor"
              : snapshot.kind === "refund_initiated"
                ? `Release blocked: refund initiated (jobPayment.status=${String((snapshot as any).jobPaymentStatus ?? "")})`
              : snapshot.kind === "blocked_by_leg_status"
                ? `Release blocked: existing leg is ${String((snapshot as any).status ?? "")} (role=${String((snapshot as any).role ?? "")})`
                : snapshot.kind === "unexpected_leg_role"
                  ? `Release blocked: unexpected TransferRecord role ${(snapshot as any).role ?? ""}`
                  : snapshot.kind === "duplicate_leg_role"
                    ? `Release blocked: duplicate TransferRecord role ${(snapshot as any).role ?? ""}`
                    : snapshot.kind === "existing_leg_amount_mismatch"
                      ? `Release blocked: TransferRecord amount mismatch (role=${String((snapshot as any).role ?? "")})`
                      : snapshot.kind === "existing_leg_currency_mismatch"
                        ? `Release blocked: TransferRecord currency mismatch (role=${String((snapshot as any).role ?? "")})`
                        : "Job is not eligible for release";
    return { ok: false, jobId, error: msg, code };
  }

  const currency = snapshot.currency;
  const stripeCurrency = toStripeCurrency(currency);

  const roles: Array<{ role: RoleLeg; userId: string; amountCents: number; kind: "router" | "contractor" | "platform" }> = [
    { role: "CONTRACTOR", userId: snapshot.contractorUserId, amountCents: snapshot.split.contractor, kind: "contractor" },
    { role: "ROUTER", userId: snapshot.routerUserId, amountCents: snapshot.split.router, kind: "router" },
    { role: "PLATFORM", userId: snapshot.platformUserId, amountCents: snapshot.split.platform, kind: "platform" },
  ];

  const existingByRole = new Map<string, any>();
  for (const r of snapshot.existing ?? []) existingByRole.set(String(r.role), r);

  // Determine methods (platform is always STRIPE-retained in-account).
  const methodsByRole = new Map<RoleLeg, Method>();
  await db.transaction(async (tx: any) => {
    methodsByRole.set("PLATFORM", "STRIPE");
    methodsByRole.set("ROUTER", await payoutMethodForUserInTx(tx, snapshot.routerUserId, currency, "router"));
    methodsByRole.set("CONTRACTOR", await payoutMethodForUserInTx(tx, snapshot.contractorUserId, currency, "contractor"));
  });

  const legResults: ReleaseLegResult[] = [];

  // Execute legs outside of DB lock; persist results in a second locked transaction.
  for (const leg of roles) {
    const method: Method = methodsByRole.get(leg.role) ?? "STRIPE";
    const existing = existingByRole.get(leg.role) ?? null;
    const amountCents = leg.amountCents;

    // If already SENT, surface as ok and ensure ledger evidence later.
    if (existing && String(existing.status) === "SENT") {
      legResults.push({
        role: leg.role,
        method: "STRIPE",
        status: "SENT",
        amountCents,
        currency,
        stripeTransferId: existing.stripeTransferId ?? null,
        externalRef: existing.externalRef ?? null,
      });
      continue;
    }

    if (leg.role === "PLATFORM") {
      // Platform retained amount is not a transfer; it's retained by design.
      legResults.push({
        role: "PLATFORM",
        method: "STRIPE",
        status: "SENT",
        amountCents,
        currency,
        stripeTransferId: null,
      });
      continue;
    }

    // Stripe transfer leg
    try {
      // Contractor lookup needs job assignment; pass via tx local field.
      const destination = await db.transaction(async (tx: any) => {
        return await stripeDestinationForLegInTx(tx, { jobId, role: leg.role as any, userId: leg.userId, currency });
      });

      const idempotencyKey = `job:${jobId}:transfer:${leg.role}:${amountCents}:${stripeCurrency}:mode:${stripeMode}`;
      const transfer = await s.transfers.create(
        {
          amount: amountCents,
          currency: stripeCurrency,
          destination,
          metadata: {
            jobId,
            role: leg.role,
            userId: leg.userId,
            triggeredByUserId,
            model: "separate_charges_transfers",
          },
        },
        { idempotencyKey },
      );

      legResults.push({
        role: leg.role,
        method: "STRIPE",
        status: "SENT",
        amountCents,
        currency,
        stripeTransferId: transfer.id,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed";
      legResults.push({ role: leg.role, method: "STRIPE", status: "FAILED", amountCents, currency, failureReason: msg });
    }
  }

  // Persist + sanity invariants.
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`select "id" from "8fold_test"."Job" where "id" = ${jobId} for update`);

    // Ensure we have an escrow row (JOB_ESCROW) tied to this payment intent for traceability.
    const stripePaymentIntentId = String((snapshot.job as any)?.stripePaymentIntentId ?? "").trim();
    if (!stripePaymentIntentId) {
      throw Object.assign(new Error("Missing stripePaymentIntentId for funded job"), { status: 409, code: "MISSING_STRIPE_PI" });
    }

    const escrowRows = await tx
      .select({
        id: escrows.id,
        status: escrows.status,
        amountCents: escrows.amountCents,
        currency: escrows.currency,
      })
      .from(escrows)
      .where(and(eq(escrows.jobId, jobId), eq(escrows.kind, "JOB_ESCROW" as any)))
      .limit(1);
    let escrow = escrowRows[0] ?? null;

    if (!escrow) {
      const inserted = await tx
        .insert(escrows)
        .values({
          jobId,
          kind: "JOB_ESCROW" as any,
          amountCents: Number((snapshot.job as any).amountCents ?? 0),
          currency: currency as any,
          status: "FUNDED" as any,
          stripePaymentIntentId,
          webhookProcessedAt: now,
          updatedAt: now,
        } as any)
        .returning({ id: escrows.id, status: escrows.status, amountCents: escrows.amountCents, currency: escrows.currency });
      escrow = inserted[0] ?? null;
      if (escrow && (process.env.STRIPE_MODE === "test" || String(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"))) {
        // eslint-disable-next-line no-console
        console.log("Escrow created for jobId=", jobId);
      }
    } else {
      // If the job is funded, escrow must not be PENDING.
      const st = String(escrow.status ?? "");
      if (st !== "FUNDED" && st !== "RELEASED") {
        await tx.update(escrows).set({ status: "FUNDED" as any, webhookProcessedAt: now, updatedAt: now } as any).where(eq(escrows.id, escrow.id));
      }
    }

    // Ledger: ensure escrow fund entry exists (CREDIT HELD).
    if (escrow?.id) {
      const fundExisting = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, SYSTEM_ESCROW_USER_ID),
            eq(ledgerEntries.jobId, jobId),
            eq(ledgerEntries.escrowId, escrow.id),
            eq(ledgerEntries.type, "ESCROW_FUND" as any),
            eq(ledgerEntries.direction, "CREDIT" as any),
            eq(ledgerEntries.bucket, "HELD" as any),
            eq(ledgerEntries.amountCents, Number((snapshot.job as any).amountCents ?? 0)),
            eq(ledgerEntries.currency, currency as any),
            eq(ledgerEntries.stripeRef, stripePaymentIntentId),
          ),
        )
        .limit(1);
      if (!fundExisting[0]?.id) {
        await tx.insert(ledgerEntries).values({
          userId: SYSTEM_ESCROW_USER_ID,
          jobId,
          escrowId: escrow.id,
          type: "ESCROW_FUND" as any,
          direction: "CREDIT" as any,
          bucket: "HELD" as any,
          amountCents: Number((snapshot.job as any).amountCents ?? 0),
          currency: currency as any,
          stripeRef: stripePaymentIntentId,
          memo: "Escrow funded (release engine backfill)",
        } as any);
        if (process.env.STRIPE_MODE === "test" || String(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")) {
          // eslint-disable-next-line no-console
          console.log("Ledger entry created for jobId=", jobId, "(ESCROW_FUND)");
        }
      }
    }

    // Upsert TransferRecord per role.
    for (const leg of roles) {
      const out = legResults.find((r) => r.role === leg.role);
      if (!out) continue;

      const status: Status = out.status === "SENT" ? "SENT" : "FAILED";
      const method: Method = out.method;
      const stripeTransferId = (out as any).stripeTransferId ?? null;
      const externalRef = (out as any).externalRef ?? null;
      const failureReason = out.status === "FAILED" ? (out as any).failureReason ?? "FAILED" : null;

      // Insert-first; on conflict(jobId,role) update mutable fields.
      await tx
        .insert(transferRecords)
        .values({
          jobId,
          role: leg.role,
          userId: leg.userId,
          amountCents: leg.amountCents,
          currency,
          method,
          stripeTransferId,
          externalRef,
          status,
          releasedAt: status === "SENT" ? now : null,
          failureReason,
        } as any)
        .onConflictDoUpdate({
          target: [transferRecords.jobId, transferRecords.role],
          set: {
            method,
            stripeTransferId,
            externalRef,
            status,
            releasedAt: status === "SENT" ? now : null,
            failureReason,
          } as any,
        });

      // Ledger evidence: Stripe-only payout rail.
      if (leg.role === "PLATFORM") {
        // Platform retained accounting entry (credit AVAILABLE).
        await ensureLedgerEvidenceInTx(tx, {
          userId: leg.userId,
          jobId,
          amountCents: leg.amountCents,
          currency,
          bucket: "AVAILABLE",
          stripeRef: null,
          memo: "Platform retained amount (release)",
          type: "BROKER_FEE",
        });
      } else if (status === "SENT") {
        await ensureLedgerEvidenceInTx(tx, {
          userId: leg.userId,
          jobId,
          amountCents: leg.amountCents,
          currency,
          bucket: "PAID",
          stripeRef: stripeTransferId,
          memo: "Stripe transfer payout (release)",
        });
      }
    }

    const allSent = legResults.every((r) => r.status === "SENT");

    // Persist job-level transfer IDs (Stripe legs only).
    const contractorSent = legResults.find((r) => r.role === "CONTRACTOR" && r.status === "SENT" && r.method === "STRIPE") as any;
    const routerSent = legResults.find((r) => r.role === "ROUTER" && r.status === "SENT" && r.method === "STRIPE") as any;

    await tx
      .update(jobs)
      .set({
        contractorTransferId: contractorSent?.stripeTransferId ?? (snapshot.job as any).contractorTransferId ?? null,
        routerTransferId: routerSent?.stripeTransferId ?? (snapshot.job as any).routerTransferId ?? null,
        releasedAt: allSent ? now : (snapshot.job as any).releasedAt ?? null,
        payoutStatus: allSent ? ("RELEASED" as any) : ("FAILED" as any),
      } as any)
      .where(eq(jobs.id, jobId));

    if (allSent && escrow?.id) {
      // Mark escrow released (best-effort) and record ledger debit from HELD.
      await tx
        .update(escrows)
        .set({ status: "RELEASED" as any, releasedAt: sql`coalesce(${escrows.releasedAt}, ${now})`, updatedAt: now } as any)
        .where(eq(escrows.id, escrow.id));

      const relExisting = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, SYSTEM_ESCROW_USER_ID),
            eq(ledgerEntries.jobId, jobId),
            eq(ledgerEntries.escrowId, escrow.id),
            eq(ledgerEntries.type, "ESCROW_RELEASE" as any),
            eq(ledgerEntries.direction, "DEBIT" as any),
            eq(ledgerEntries.bucket, "HELD" as any),
            eq(ledgerEntries.amountCents, Number((snapshot.job as any).amountCents ?? 0)),
            eq(ledgerEntries.currency, currency as any),
            eq(ledgerEntries.stripeRef, `release:${jobId}`),
          ),
        )
        .limit(1);
      if (!relExisting[0]?.id) {
        await tx.insert(ledgerEntries).values({
          userId: SYSTEM_ESCROW_USER_ID,
          jobId,
          escrowId: escrow.id,
          type: "ESCROW_RELEASE" as any,
          direction: "DEBIT" as any,
          bucket: "HELD" as any,
          amountCents: Number((snapshot.job as any).amountCents ?? 0),
          currency: currency as any,
          stripeRef: `release:${jobId}`,
          memo: "Escrow released (connect transfers)",
        } as any);
      }
    }
  });

  const alreadyReleased = Boolean((snapshot.job as any).releasedAt) || String((snapshot.job as any).payoutStatus ?? "") === "RELEASED";
  return { ok: true, jobId, alreadyReleased, legs: legResults };
}

