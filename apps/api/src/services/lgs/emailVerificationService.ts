/**
 * LGS Email Verification — instant format classifier.
 *
 * Old system: SMTP/DNS probing → queue → worker → retry loop → deadlock.
 * New system: classify by format on write. No network. No retries. No queue.
 *
 * Three states:
 *   valid   — email looks worth trying
 *   invalid — obvious junk (bad format, noreply, bad domain)
 *   pending — no email yet (enrichment in progress)
 *
 * Tabs:
 *   Ready to Send  = email + valid
 *   Processing     = no email yet (enrichment only)
 *   Not Ready      = has email but invalid
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";
import {
  scoreAndSaveContractorLead,
  scoreAndSaveJobPosterLead,
} from "./priorityScoringService";

type Pipeline = "contractor" | "jobs";
export type EmailVerificationStatus = "pending" | "valid" | "invalid";

const INVALID_PATTERNS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "unsubscribe",
];
const INVALID_DOMAIN_PATTERNS = [
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
];

// ─── Core classifier ──────────────────────────────────────────────────────────

/**
 * Instant email classification — no SMTP, no DNS, no network.
 * Returns 'valid' if the email looks worth trying, 'invalid' if it's junk.
 */
export function classifyEmail(email: string | null | undefined): "valid" | "invalid" {
  if (!email) return "invalid";
  const lower = email.trim().toLowerCase();
  if (!lower || !lower.includes("@")) return "invalid";

  const atIdx = lower.indexOf("@");
  const local = lower.slice(0, atIdx);
  const domain = lower.slice(atIdx + 1);

  if (!local || !domain || !domain.includes(".")) return "invalid";
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return "invalid";

  for (const p of INVALID_PATTERNS) {
    if (lower.includes(p)) return "invalid";
  }
  for (const d of INVALID_DOMAIN_PATTERNS) {
    if (domain === d) return "invalid";
  }

  return "valid";
}

export function normalizeVerificationStatus(status: string | null | undefined): EmailVerificationStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "invalid") return "invalid";
  if (normalized === "valid" || normalized === "verified") return "valid";
  return "pending";
}

/** @deprecated — use classifyEmail() instead */
export function isValidEmailCandidate(email: string | null | undefined): boolean {
  return classifyEmail(email) === "valid";
}

// ─── DB apply ─────────────────────────────────────────────────────────────────

async function applyClassificationToContractors(
  normalizedEmail: string,
  status: "valid" | "invalid"
): Promise<string[]> {
  const leads = await db
    .select({ id: contractorLeads.id })
    .from(contractorLeads)
    .where(sql`lower(trim(${contractorLeads.email})) = ${normalizedEmail}`);

  if (leads.length === 0) return [];

  await db
    .update(contractorLeads)
    .set({
      verificationStatus: status,
      emailVerificationStatus: status,
      emailVerificationCheckedAt: new Date(),
      emailVerificationProvider: "format-classifier",
      scoreDirty: true,
      updatedAt: new Date(),
    })
    .where(sql`lower(trim(${contractorLeads.email})) = ${normalizedEmail}`);

  for (const lead of leads) {
    await scoreAndSaveContractorLead(lead.id);
  }
  return leads.map((l) => l.id);
}

async function applyClassificationToJobs(
  normalizedEmail: string,
  status: "valid" | "invalid"
): Promise<string[]> {
  const leads = await db
    .select({ id: jobPosterLeads.id })
    .from(jobPosterLeads)
    .where(sql`lower(trim(${jobPosterLeads.email})) = ${normalizedEmail}`);

  if (leads.length === 0) return [];

  await db
    .update(jobPosterLeads)
    .set({
      emailVerificationStatus: status,
      emailVerificationCheckedAt: new Date(),
      emailVerificationProvider: "format-classifier",
      processingStatus: "processed",
      scoreDirty: true,
      updatedAt: new Date(),
    })
    .where(sql`lower(trim(${jobPosterLeads.email})) = ${normalizedEmail}`);

  for (const lead of leads) {
    await scoreAndSaveJobPosterLead(lead.id);
  }
  return leads.map((l) => l.id);
}

// ─── Batch classifier ─────────────────────────────────────────────────────────

/**
 * Classify a batch of leads by email format. Instant — no network.
 * Safe to call on import, on email discovery, or as a one-time catch-up.
 */
export async function classifyLeadBatch(args: {
  pipeline: Pipeline;
  leadIds?: string[];
  allUnclassified?: boolean;
  limit?: number;
}): Promise<{ classified: number; valid: number; invalid: number; skipped: number }> {
  const { pipeline, leadIds = [], allUnclassified = false, limit } = args;
  const table = pipeline === "contractor" ? contractorLeads : jobPosterLeads;
  // contractor_leads uses verification_status; job_poster_leads uses email_verification_status
  const statusCol = pipeline === "contractor"
    ? contractorLeads.verificationStatus
    : jobPosterLeads.emailVerificationStatus;

  const conditions = [
    sql`${table.email} is not null`,
    sql`trim(${table.email}) <> ''`,
    eq(table.archived, false),
  ];

  if (leadIds.length > 0) {
    conditions.push(sql`${table.id} = ANY(ARRAY[${sql.join(leadIds.map((id) => sql`${id}::uuid`), sql`, `)}])`);
  } else if (allUnclassified) {
    // Process leads not yet classified (pending) or needing re-check
    conditions.push(
      sql`coalesce(lower(trim(${statusCol})), 'pending') not in ('valid', 'invalid')`
    );
  }

  const query = db
    .select({ id: table.id, email: table.email })
    .from(table)
    .where(and(...conditions))
    .orderBy(table.createdAt);

  const rows = limit ? await query.limit(limit) : await query;

  let valid = 0;
  let invalid = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.email) { skipped++; continue; }
    const status = classifyEmail(row.email);
    const normalized = row.email.trim().toLowerCase();
    if (pipeline === "contractor") {
      await applyClassificationToContractors(normalized, status);
    } else {
      await applyClassificationToJobs(normalized, status);
    }
    if (status === "valid") valid++;
    else invalid++;
  }

  console.log("[Classify] Batch complete", { pipeline, total: rows.length, valid, invalid, skipped });
  return { classified: valid + invalid, valid, invalid, skipped };
}

// ─── Legacy shims (preserves callers in importLeadsService, verify route, etc.) ──

/**
 * @deprecated — instant shim: classifies the email on the spot, no queue.
 */
export async function enqueueVerificationEmail(email: string): Promise<{
  action: "queued" | "cached" | "already_queued" | "invalid" | "skipped";
  normalizedEmail?: string;
}> {
  if (!email?.trim()) return { action: "skipped" };
  const normalized = email.trim().toLowerCase();
  const status = classifyEmail(email);
  if (status === "invalid") {
    await applyClassificationToContractors(normalized, "invalid");
    await applyClassificationToJobs(normalized, "invalid");
    return { action: "invalid", normalizedEmail: normalized };
  }
  await applyClassificationToContractors(normalized, "valid");
  await applyClassificationToJobs(normalized, "valid");
  return { action: "queued", normalizedEmail: normalized };
}

/**
 * @deprecated — instant shim: runs classifyLeadBatch, returns queue-compatible shape.
 */
export async function enqueueLeadVerificationBatch(args: {
  pipeline: Pipeline;
  leadIds?: string[];
  allPending?: boolean;
  limit?: number;
}): Promise<{
  queued: number;
  cached: number;
  alreadyQueued: number;
  invalid: number;
  skipped: number;
  total: number;
}> {
  const result = await classifyLeadBatch({
    pipeline: args.pipeline,
    leadIds: args.leadIds,
    allUnclassified: args.allPending,
    limit: args.limit,
  });
  return {
    queued: result.valid,
    cached: 0,
    alreadyQueued: 0,
    invalid: result.invalid,
    skipped: result.skipped,
    total: result.classified + result.skipped,
  };
}

/**
 * @deprecated — no-op: SMTP worker removed. Classification is instant on write.
 */
export async function runEmailVerificationWorker(): Promise<{
  processed: number;
  completed: number;
  failed: number;
}> {
  console.log("[Verify] Worker disabled — classification is now instant on import.");
  return { processed: 0, completed: 0, failed: 0 };
}

/**
 * @deprecated — no-op: unknown resolution worker removed.
 */
export async function runUnknownResolutionWorker() {
  return { scanned: 0, retried: 0, resolved: 0, archived: 0, fallbackEmails: 0, enrichmentQueued: 0, skipped: 0 };
}

// ─── Progress / status ────────────────────────────────────────────────────────

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
  const statusCol = pipeline === "contractor"
    ? contractorLeads.verificationStatus
    : jobPosterLeads.emailVerificationStatus;

  const conditions = [
    sql`${table.email} is not null`,
    sql`trim(${table.email}) <> ''`,
    eq(table.archived, false),
  ];
  if (leadIds.length > 0) {
    conditions.push(sql`${table.id} = ANY(ARRAY[${sql.join(leadIds.map((id) => sql`${id}::uuid`), sql`, `)}])`);
  } else if (allPending) {
    conditions.push(sql`coalesce(lower(trim(${statusCol})), 'pending') != 'valid'`);
  }

  const rows = await db
    .select({ verificationStatus: statusCol })
    .from(table)
    .where(and(...conditions));

  let valid = 0;
  let invalid = 0;
  let pending = 0;
  for (const row of rows) {
    const s = normalizeVerificationStatus(row.verificationStatus);
    if (s === "valid") valid++;
    else if (s === "invalid") invalid++;
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
    queue_pending: 0,
    queue_processing: 0,
  };
}
