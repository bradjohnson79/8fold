import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { computeEscrowPricing, computeEscrowSplitAllocations } from "@/src/services/escrow/pricing";
import { badRequest } from "@/src/services/v4/v4Errors";

function toCents(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function computeStripeFeeCents(totalCents: number): number {
  return Math.max(0, Math.round(totalCents * 0.029) + 30);
}

export type JobPosterPaymentConfirmBreakdown = {
  ok: true;
  jobId: string;
  currency: "USD" | "CAD";
  baseCents: number;
  contractorShareCents: number;
  routerShareCents: number;
  platformShareCents: number;
  stripeFeeCents: number;
  taxCents: number;
  totalCents: number;
};

export async function getJobPosterPaymentConfirm(userId: string, jobId: string): Promise<JobPosterPaymentConfirmBreakdown> {
  const rows = await db
    .select({
      id: jobs.id,
      appraisalSubtotalCents: jobs.appraisal_subtotal_cents,
      regionalFeeCents: jobs.regional_fee_cents,
      taxAmountCents: jobs.tax_amount_cents,
      totalAmountCents: jobs.total_amount_cents,
      amountCents: jobs.amount_cents,
      transactionFeeCents: jobs.transaction_fee_cents,
      countryCode: jobs.country_code,
      provinceCode: jobs.state_code,
      isRegional: jobs.is_regional,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.job_poster_user_id, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

  const appraisalSubtotalFromRow = toCents(row.appraisalSubtotalCents);
  const fallbackBase = toCents(row.totalAmountCents) > 0 ? toCents(row.totalAmountCents) : toCents(row.amountCents);
  const appraisalSubtotalCents = appraisalSubtotalFromRow > 0 ? appraisalSubtotalFromRow : fallbackBase;

  const pricing = await computeEscrowPricing({
    appraisalSubtotalCents,
    isRegional: Boolean(row.isRegional),
    country: String(row.countryCode ?? "US"),
    province: String(row.provinceCode ?? ""),
  });

  const split = computeEscrowSplitAllocations({
    appraisalSubtotalCents: pricing.appraisalSubtotalCents,
    regionalFeeCents: pricing.regionalFeeCents,
    taxAmountCents: pricing.taxAmountCents,
  });

  const taxCents = String(row.countryCode ?? "").toUpperCase() === "CA" ? pricing.taxAmountCents : 0;
  const stripeFeeStored = toCents(row.transactionFeeCents);
  const stripeFeeCents = stripeFeeStored > 0 ? stripeFeeStored : computeStripeFeeCents(split.splitBaseCents + taxCents);
  const totalCents = split.splitBaseCents + taxCents + stripeFeeCents;

  return {
    ok: true,
    jobId: row.id,
    currency: pricing.currency,
    baseCents: split.splitBaseCents,
    contractorShareCents: split.contractorCents,
    routerShareCents: split.routerCents,
    platformShareCents: split.platformCents,
    stripeFeeCents,
    taxCents,
    totalCents,
  };
}
