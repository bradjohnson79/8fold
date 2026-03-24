import EmailValidator from "email-deep-validator";
import pLimit from "p-limit";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  emailVerificationQueue,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";
import {
  scoreAndSaveContractorLead,
  scoreAndSaveJobPosterLead,
} from "./priorityScoringService";

type Pipeline = "contractor" | "jobs";
type QueueStatus = "pending" | "processing" | "completed" | "failed";
export type EmailVerificationStatus = "pending" | "valid" | "invalid";

type VerificationResult = {
  status: EmailVerificationStatus;
  score: number;
  provider: string;
  checkedAt: Date;
  metadata: Record<string, unknown>;
};

type ValidatorResult = {
  wellFormed?: boolean | null;
  validDomain?: boolean | null;
  validMailbox?: boolean | null;
};

const BATCH_SIZE = 20;
const VERIFY_CONCURRENCY = 5;
const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFY_RETRY_INTERVAL_MS = 60 * 60 * 1000;
const PROVIDER_NAME = "email-deep-validator";
const DISABLED_WORKER_RESULT = {
  scanned: 0,
  retried: 0,
  resolved: 0,
  archived: 0,
  fallbackEmails: 0,
  enrichmentQueued: 0,
  skipped: 0,
};
const validator = new EmailValidator({ timeout: 8000 });

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeVerificationStatus(status: string | null | undefined): EmailVerificationStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return "pending";
  if (normalized === "invalid") return "invalid";
  if (normalized === "valid" || normalized === "verified") return "valid";
  if (normalized === "pending" || normalized === "risky" || normalized === "catch_all" || normalized === "unknown") {
    return "pending";
  }
  return "pending";
}

function createVerificationResult(
  status: EmailVerificationStatus,
  score: number,
  metadata: Record<string, unknown>,
  provider = PROVIDER_NAME
): VerificationResult {
  return {
    status,
    score,
    provider,
    checkedAt: new Date(),
    metadata,
  };
}

export function isValidEmailCandidate(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(String(email ?? ""));
  if (!normalized) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (/\.(svg|png|jpe?g|gif|webp|ico|pdf)$/i.test(normalized)) return false;

  const [, domain = ""] = normalized.split("@");
  if (!domain || !domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;

  return true;
}

function createImmediateInvalidResult(email: string, reason: string): VerificationResult {
  return createVerificationResult("invalid", 0, {
    email,
    reason,
    immediate: true,
  });
}

export async function verifyEmailAddress(email: string): Promise<VerificationResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmailCandidate(normalized)) {
    return createImmediateInvalidResult(normalized, "invalid_email_format");
  }

  try {
    const result = await validator.verify(normalized);
    return classifyEmailVerification(normalized, result, {
      checkedAt: new Date(),
      provider: PROVIDER_NAME,
    });
  } catch (error) {
    return createVerificationResult("pending", 50, {
      email: normalized,
      error: error instanceof Error ? error.message : "verification_pending_retry",
    });
  }
}

export function classifyEmailVerification(
  email: string,
  result: ValidatorResult,
  opts: { catchAll?: boolean; checkedAt?: Date; provider?: string }
): VerificationResult {
  const checkedAt = opts.checkedAt ?? new Date();
  const provider = opts.provider ?? PROVIDER_NAME;
  const metadata: Record<string, unknown> = {
    email,
    wellFormed: result.wellFormed ?? null,
    validDomain: result.validDomain ?? null,
    validMailbox: result.validMailbox ?? null,
  };

  if (!result.wellFormed || !result.validDomain || result.validMailbox === false) {
    return { status: "invalid", score: 0, provider, checkedAt, metadata };
  }

  if (result.validMailbox === true) {
    return { status: "valid", score: 100, provider, checkedAt, metadata };
  }

  return { status: "pending", score: 50, provider, checkedAt, metadata };
}

async function applyVerificationResultToContractors(
  normalizedEmail: string,
  result: VerificationResult,
  attemptCount = 1
): Promise<string[]> {
  const leads = await db
    .select({ id: contractorLeads.id })
    .from(contractorLeads)
    .where(sql`lower(trim(${contractorLeads.email})) = ${normalizedEmail}`);

  if (leads.length === 0) return [];

  await db
    .update(contractorLeads)
    .set({
      emailVerificationStatus: result.status,
      emailVerificationCheckedAt: result.checkedAt,
      emailVerificationScore: result.score,
      emailVerificationProvider: result.provider,
      verificationAttempts: sql`greatest(coalesce(${contractorLeads.verificationAttempts}, 0), ${attemptCount})`,
      verificationStatus: result.status,
      verificationScore: result.score,
      verificationSource: result.provider,
      scoreDirty: true,
      updatedAt: new Date(),
    })
    .where(sql`lower(trim(${contractorLeads.email})) = ${normalizedEmail}`);

  for (const lead of leads) {
    await scoreAndSaveContractorLead(lead.id);
  }
  return leads.map((lead) => lead.id);
}

async function applyVerificationResultToJobs(
  normalizedEmail: string,
  result: VerificationResult,
  attemptCount = 1
): Promise<string[]> {
  const leads = await db
    .select({ id: jobPosterLeads.id })
    .from(jobPosterLeads)
    .where(sql`lower(trim(${jobPosterLeads.email})) = ${normalizedEmail}`);

  if (leads.length === 0) return [];

  await db
    .update(jobPosterLeads)
    .set({
      emailVerificationStatus: result.status,
      emailVerificationCheckedAt: result.checkedAt,
      emailVerificationScore: result.score,
      emailVerificationProvider: result.provider,
      verificationAttempts: sql`greatest(coalesce(${jobPosterLeads.verificationAttempts}, 0), ${attemptCount})`,
      scoreDirty: true,
      updatedAt: new Date(),
    })
    .where(sql`lower(trim(${jobPosterLeads.email})) = ${normalizedEmail}`);

  for (const lead of leads) {
    await scoreAndSaveJobPosterLead(lead.id);
  }
  return leads.map((lead) => lead.id);
}

export async function applyVerificationResultToAllLeads(
  normalizedEmail: string,
  result: VerificationResult,
  opts?: { attemptCount?: number }
): Promise<{
  contractorLeadIds: string[];
  jobLeadIds: string[];
}> {
  const attemptCount = opts?.attemptCount ?? 1;
  const contractorLeadIds = await applyVerificationResultToContractors(normalizedEmail, result, attemptCount);
  const jobLeadIds = await applyVerificationResultToJobs(normalizedEmail, result, attemptCount);
  return { contractorLeadIds, jobLeadIds };
}

function toCachedResult(existing: {
  resultStatus: string | null;
  resultScore: number | null;
  provider: string | null;
  checkedAt: Date | null;
  metadata: unknown;
}): VerificationResult {
  return {
    status: normalizeVerificationStatus(existing.resultStatus),
    score: existing.resultScore ?? 50,
    provider: existing.provider ?? PROVIDER_NAME,
    checkedAt: existing.checkedAt ?? new Date(),
    metadata: (existing.metadata as Record<string, unknown> | null) ?? {},
  };
}

function isPendingRetryEligible(existing: {
  status: string;
  resultStatus: string | null;
  attempts: number | null;
  checkedAt: Date | null;
  updatedAt: Date | null;
  createdAt: Date | null;
}): boolean {
  if (!["completed", "failed"].includes(existing.status)) return false;
  if (normalizeVerificationStatus(existing.resultStatus) !== "pending") return false;
  if ((existing.attempts ?? 0) >= MAX_VERIFICATION_ATTEMPTS) return false;
  const lastTouched = existing.checkedAt ?? existing.updatedAt ?? existing.createdAt;
  if (!lastTouched) return true;
  return Date.now() - lastTouched.getTime() >= VERIFY_RETRY_INTERVAL_MS;
}

export async function enqueueVerificationEmail(email: string): Promise<{
  action: "queued" | "cached" | "already_queued" | "invalid" | "skipped";
  normalizedEmail?: string;
  result?: VerificationResult;
}> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { action: "skipped" };
  if (!isValidEmailCandidate(normalizedEmail)) {
    const result = createImmediateInvalidResult(normalizedEmail, "invalid_email_format");
    await applyVerificationResultToAllLeads(normalizedEmail, result);
    return { action: "invalid", normalizedEmail, result };
  }

  const [existing] = await db
    .select()
    .from(emailVerificationQueue)
    .where(eq(emailVerificationQueue.normalizedEmail, normalizedEmail))
    .limit(1);

  if (!existing) {
    await db.insert(emailVerificationQueue).values({
      normalizedEmail,
      originalEmail: email.trim(),
      status: "pending",
      attempts: 0,
      updatedAt: new Date(),
    });
    return { action: "queued", normalizedEmail };
  }

  if (existing.status === "pending" || existing.status === "processing") {
    return { action: "already_queued", normalizedEmail };
  }

  if (isPendingRetryEligible(existing)) {
    await db
      .update(emailVerificationQueue)
      .set({
        originalEmail: email.trim(),
        status: "pending",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(emailVerificationQueue.id, existing.id));
    return { action: "queued", normalizedEmail };
  }

  if (existing.resultStatus) {
    const result = toCachedResult(existing);
    await applyVerificationResultToAllLeads(normalizedEmail, result, {
      attemptCount: Math.max(existing.attempts ?? 0, 1),
    });
    return { action: "cached", normalizedEmail, result };
  }

  await db
    .update(emailVerificationQueue)
    .set({
      originalEmail: email.trim(),
      status: "pending",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(emailVerificationQueue.id, existing.id));

  return { action: "queued", normalizedEmail };
}

export async function enqueueLeadVerificationBatch(args: {
  pipeline: Pipeline;
  leadIds?: string[];
  allPending?: boolean;
  /** Max leads to enqueue per call. Prevents flooding the queue at scale. Default: unlimited. */
  limit?: number;
}): Promise<{
  queued: number;
  cached: number;
  alreadyQueued: number;
  invalid: number;
  skipped: number;
  total: number;
}> {
  const { pipeline, leadIds = [], allPending = false, limit } = args;
  const table = pipeline === "contractor" ? contractorLeads : jobPosterLeads;

  const conditions = [
    sql`${table.email} is not null`,
    sql`trim(${table.email}) <> ''`,
    eq(table.archived, false),
  ];

  if (leadIds.length > 0) {
    conditions.push(inArray(table.id, leadIds));
  } else if (allPending) {
    conditions.push(sql`coalesce(lower(trim(${table.emailVerificationStatus})), 'pending') != 'valid'`);
  }

  const query = db
    .select({ id: table.id, email: table.email, verificationStatus: table.emailVerificationStatus })
    .from(table)
    .where(and(...conditions))
    .orderBy(table.createdAt);

  const rows = limit ? await query.limit(limit) : await query;

  let queued = 0;
  let cached = 0;
  let alreadyQueued = 0;
  let invalid = 0;
  let skipped = 0;

  for (const row of rows) {
    const normalizedStatus = normalizeVerificationStatus(row.verificationStatus);
    if (!row.email || normalizedStatus === "valid") {
      skipped++;
      continue;
    }
    const result = await enqueueVerificationEmail(row.email);
    if (result.action === "queued") queued++;
    else if (result.action === "cached") cached++;
    else if (result.action === "already_queued") alreadyQueued++;
    else if (result.action === "invalid") invalid++;
    else skipped++;
  }

  console.log("[Verify] Queued batch summary", {
    pipeline,
    total: rows.length,
    queued,
    cached,
    alreadyQueued,
    invalid,
    skipped,
  });

  return { queued, cached, alreadyQueued, invalid, skipped, total: rows.length };
}

async function fetchVerificationQueueBatch(limit: number) {
  const retryCutoff = new Date(Date.now() - VERIFY_RETRY_INTERVAL_MS);
  return db
    .select()
    .from(emailVerificationQueue)
    .where(sql`(
      ${emailVerificationQueue.status} = 'pending'
      OR (
        ${emailVerificationQueue.status} IN ('completed', 'failed')
        AND coalesce(lower(trim(${emailVerificationQueue.resultStatus})), 'pending') = 'pending'
        AND coalesce(${emailVerificationQueue.attempts}, 0) < ${MAX_VERIFICATION_ATTEMPTS}
        AND coalesce(${emailVerificationQueue.checkedAt}, ${emailVerificationQueue.updatedAt}, ${emailVerificationQueue.createdAt}) <= ${retryCutoff}
      )
    )`)
    .orderBy(emailVerificationQueue.createdAt)
    .limit(limit);
}

export async function runEmailVerificationWorker(limit = BATCH_SIZE): Promise<{ processed: number; completed: number; failed: number }> {
  const rows = await fetchVerificationQueueBatch(limit);

  if (rows.length === 0) {
    return { processed: 0, completed: 0, failed: 0 };
  }

  let completed = 0;
  let failed = 0;
  const runWithLimit = pLimit(VERIFY_CONCURRENCY);

  console.log("[Verify] Processing batch", { size: rows.length, concurrency: VERIFY_CONCURRENCY });

  await Promise.all(rows.map((row) => runWithLimit(async () => {
    const attemptCount = (row.attempts ?? 0) + 1;

    await db
      .update(emailVerificationQueue)
      .set({
        status: "processing" satisfies QueueStatus,
        attempts: attemptCount,
        updatedAt: new Date(),
      })
      .where(eq(emailVerificationQueue.id, row.id));

    try {
      const result = await verifyEmailAddress(row.normalizedEmail);
      await applyVerificationResultToAllLeads(row.normalizedEmail, result, { attemptCount });
      await db
        .update(emailVerificationQueue)
        .set({
          status: "completed",
          checkedAt: result.checkedAt,
          provider: result.provider,
          resultStatus: result.status,
          resultScore: result.score,
          metadata: result.metadata,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(emailVerificationQueue.id, row.id));
      completed++;
    } catch (error) {
      await db
        .update(emailVerificationQueue)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "verification_failed",
          updatedAt: new Date(),
        })
        .where(eq(emailVerificationQueue.id, row.id));
      failed++;
    }
  })));

  console.log("[Verify] Completed", { processed: rows.length, completed, failed });
  return { processed: rows.length, completed, failed };
}

export async function runUnknownResolutionWorker() {
  console.log("[Verify] Legacy unknown-resolution worker disabled for simplicity reset");
  return DISABLED_WORKER_RESULT;
}

export async function getVerificationProgress(args: {
  pipeline: Pipeline;
  leadIds?: string[];
  allPending?: boolean;
}): Promise<{
  total: number;
  processed: number;
  valid: number;
  invalid: number;
  pending: number;
  verified: number;
  risky: number;
  catch_all: number;
  unknown: number;
  remaining: number;
  queue_pending: number;
  queue_processing: number;
}> {
  const { pipeline, leadIds = [], allPending = false } = args;
  const table = pipeline === "contractor" ? contractorLeads : jobPosterLeads;
  const conditions = [
    sql`${table.email} is not null`,
    sql`trim(${table.email}) <> ''`,
    eq(table.archived, false),
  ];

  if (leadIds.length > 0) {
    conditions.push(inArray(table.id, leadIds));
  } else if (allPending) {
    conditions.push(sql`coalesce(lower(trim(${table.emailVerificationStatus})), 'pending') != 'valid'`);
  }

  const rows = await db
    .select({
      email: table.email,
      verificationStatus: table.emailVerificationStatus,
    })
    .from(table)
    .where(and(...conditions));

  const validEmails = Array.from(
    new Set(
      rows
        .map((row) => normalizeEmail(String(row.email ?? "")))
        .filter((email) => isValidEmailCandidate(email))
    )
  );

  let queuePending = 0;
  let queueProcessing = 0;
  if (validEmails.length > 0) {
    const queueRows = await db
      .select({
        normalizedEmail: emailVerificationQueue.normalizedEmail,
        status: emailVerificationQueue.status,
      })
      .from(emailVerificationQueue)
      .where(inArray(emailVerificationQueue.normalizedEmail, validEmails));

    for (const row of queueRows) {
      if (row.status === "pending") queuePending++;
      if (row.status === "processing") queueProcessing++;
    }
  }

  let valid = 0;
  let invalid = 0;
  let pending = 0;
  for (const row of rows) {
    const status = normalizeVerificationStatus(row.verificationStatus);
    if (status === "valid") valid++;
    else if (status === "invalid") invalid++;
    else pending++;
  }

  return {
    total: rows.length,
    processed: valid + invalid,
    valid,
    invalid,
    pending,
    verified: valid,
    risky: 0,
    catch_all: 0,
    unknown: pending,
    remaining: pending,
    queue_pending: queuePending,
    queue_processing: queueProcessing,
  };
}
