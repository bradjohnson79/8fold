export type RefundEligibilityJobLike = {
  id?: string;
  title?: string;
  createdAt?: string | Date | null;
  status?: string | null;
  payoutStatus?: string | null;
  assignment?: null | { contractorId?: string | null } | undefined;
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function asUtcDate(d: Date): Date {
  // Reconstruct in UTC to avoid local-time DST quirks during day increments.
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
}

function isWeekendUtc(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  return dow === 0 || dow === 6;
}

/**
 * Adds business days while preserving time-of-day.
 *
 * IMPORTANT: This implementation matches the product example:
 * "Monday 12:00 -> Friday 12:00 eligible" when adding 5 business days,
 * meaning the start-day counts as business day 1 if it's Mon-Fri.
 *
 * - Weekends are excluded.
 * - Time-of-day is preserved.
 * - Uses UTC day math for determinism.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const base = asUtcDate(date);
  const target = Math.max(0, Math.floor(days));
  if (target === 0) return new Date(base.getTime());

  let d = new Date(base.getTime());
  let counted = 0;
  while (counted < target) {
    if (!isWeekendUtc(d)) counted++;
    if (counted >= target) break;
    d = new Date(d.getTime() + MS_PER_DAY);
  }
  return d;
}

function parseCreatedAt(input: unknown): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const s = typeof input === "string" ? input : null;
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

const ELIGIBLE_STATUSES = new Set(["DRAFT", "OPEN_FOR_ROUTING", "PUBLISHED"]);
const INELIGIBLE_STATUSES = new Set([
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "COMPLETED_APPROVED",
  "DISPUTED",
]);

export function isRefundEligible(job: RefundEligibilityJobLike, now: Date): boolean {
  const createdAt = parseCreatedAt(job.createdAt);
  if (!createdAt) return false;

  const status = String(job.status ?? "").trim().toUpperCase();
  if (INELIGIBLE_STATUSES.has(status)) return false;
  if (!ELIGIBLE_STATUSES.has(status)) return false;

  const payoutStatus = String(job.payoutStatus ?? "").trim().toUpperCase();
  if (payoutStatus === "RELEASED") return false;

  const contractorAssigned = Boolean(job.assignment && String((job.assignment as any).contractorId ?? "").trim());
  if (contractorAssigned) return false;

  const eligibleAt = addBusinessDays(createdAt, 5);
  return now.getTime() >= eligibleAt.getTime();
}

export function refundEligibleAtUtc(job: RefundEligibilityJobLike): Date | null {
  const createdAt = parseCreatedAt(job.createdAt);
  if (!createdAt) return null;
  return addBusinessDays(createdAt, 5);
}

export function formatEligibilityCountdown(eligibleAt: Date, now: Date): string {
  const ms = eligibleAt.getTime() - now.getTime();
  if (ms <= 0) return "Eligible now";

  if (ms < MS_PER_HOUR) return "Eligible in: <1 hour";

  const totalHours = Math.floor(ms / MS_PER_HOUR);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `Eligible in: ${days} days ${hours} hours`;
}

