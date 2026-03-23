import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, jobPosterLeads, leadFinderDomains } from "@/db/schema/directoryEngine";

type Pipeline = "contractor" | "jobs";
type PriorityBucket = "high" | "medium" | "low";
type VerificationStatus = "pending" | "valid" | "invalid";

type ScoreInput = {
  pipeline: Pipeline;
  verificationStatus: string | null | undefined;
  contactName?: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  title?: string | null | undefined;
  companyName?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  email?: string | null | undefined;
  trade?: string | null | undefined;
  category?: string | null | undefined;
  emailBounced?: boolean | null | undefined;
  archived?: boolean | null | undefined;
  archiveReason?: string | null | undefined;
  replyCount?: number | null | undefined;
  responseReceived?: boolean | null | undefined;
  contactAttempts?: number | null | undefined;
  lastContactedAt?: Date | string | null | undefined;
  lastRepliedAt?: Date | string | null | undefined;
  domainReplyRate?: number | null | undefined;
};

type ScoreResult = {
  score: number;
  bucket: PriorityBucket;
};

const FREE_PROVIDER_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "live.com",
  "msn.com",
]);

const HIGH_DEMAND_TRADES = new Set([
  "roofing",
  "hvac",
  "plumbing",
  "electricians",
  "general contractors",
  "general_contractor",
]);

const HIGH_VALUE_JOB_CATEGORIES = new Set([
  "property_management",
  "developer",
  "realtor",
]);

export const LOW_QUALITY_ARCHIVE_REASON = "low_quality_score";
export const UNKNOWN_RESOLUTION_ARCHIVE_REASON = "unknown_unresolved";
const HIGH_PRIORITY_THRESHOLD = 70;
const MEDIUM_PRIORITY_THRESHOLD = 35;

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDomain(value: string | null | undefined): string {
  return normalize(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEmailDomain(email: string | null | undefined): string {
  const normalized = normalize(email);
  const at = normalized.lastIndexOf("@");
  return at >= 0 ? normalized.slice(at + 1) : "";
}

function hasName(input: ScoreInput): boolean {
  return Boolean(
    normalize(input.contactName) ||
    normalize(input.firstName) ||
    normalize(input.lastName)
  );
}

function bucketForScore(score: number): PriorityBucket {
  if (score >= HIGH_PRIORITY_THRESHOLD) return "high";
  if (score >= MEDIUM_PRIORITY_THRESHOLD) return "medium";
  return "low";
}

function getReplyBoost(replyCount: number): number {
  if (replyCount >= 2) return 50;
  if (replyCount >= 1) return 30;
  return 0;
}

function getReplyRecencyBoost(lastRepliedAt: Date | string | null | undefined): number {
  const repliedAt = toDate(lastRepliedAt);
  if (!repliedAt) return 0;
  const ageMs = Date.now() - repliedAt.getTime();
  if (ageMs <= 24 * 60 * 60 * 1000) return 20;
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return 10;
  return 0;
}

function getSilencePenalty(input: Pick<ScoreInput, "responseReceived" | "contactAttempts" | "lastContactedAt">): number {
  if (input.responseReceived) return 0;
  if ((input.contactAttempts ?? 0) <= 0) return 0;
  const contactedAt = toDate(input.lastContactedAt);
  if (!contactedAt) return 0;
  const ageMs = Date.now() - contactedAt.getTime();
  if (ageMs >= 14 * 24 * 60 * 60 * 1000) return -30;
  if (ageMs >= 7 * 24 * 60 * 60 * 1000) return -10;
  return 0;
}

async function getLeadDomainReplyRate(args: {
  campaignId: string | null | undefined;
  website: string | null | undefined;
}): Promise<number> {
  const domain = normalizeDomain(args.website);
  if (!args.campaignId || !domain) return 0;

  const [row] = await db
    .select({ replyRate: leadFinderDomains.replyRate })
    .from(leadFinderDomains)
    .where(
      and(
        eq(leadFinderDomains.campaignId, args.campaignId),
        sql`lower(${leadFinderDomains.domain}) = ${domain}`
      )
    )
    .limit(1);

  return Number(row?.replyRate ?? 0);
}

export async function syncCampaignDomainReplyRate(args: {
  pipeline: Pipeline;
  campaignId: string | null | undefined;
  website: string | null | undefined;
}): Promise<number> {
  const domain = normalizeDomain(args.website);
  if (!args.campaignId || !domain) return 0;

  const table = args.pipeline === "contractor" ? contractorLeads : jobPosterLeads;
  const [counts] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${table.contactAttempts} > 0)::int`,
      replied: sql<number>`count(*) filter (where ${table.replyCount} > 0)::int`,
    })
    .from(table)
    .where(
      and(
        eq(table.campaignId, args.campaignId),
        sql`lower(${table.website}) = ${domain}`
      )
    );

  const sent = Number(counts?.sent ?? 0);
  const replied = Number(counts?.replied ?? 0);
  const replyRate = sent > 0 ? replied / sent : 0;

  await db
    .update(leadFinderDomains)
    .set({ replyRate })
    .where(
      and(
        eq(leadFinderDomains.campaignId, args.campaignId),
        sql`lower(${leadFinderDomains.domain}) = ${domain}`
      )
    );

  console.log("[Domain] Reply rate updated", {
    pipeline: args.pipeline,
    campaignId: args.campaignId,
    domain,
    sent,
    replied,
    replyRate,
  });

  return replyRate;
}

function normalizeVerificationStatus(value: string | null | undefined): VerificationStatus {
  const normalized = normalize(value);
  if (normalized === "invalid") return "invalid";
  if (normalized === "valid" || normalized === "verified") return "valid";
  return "pending";
}

export function calculatePriority(input: ScoreInput): ScoreResult {
  let score = 0;
  const verificationStatus = normalizeVerificationStatus(input.verificationStatus);
  const emailDomain = getEmailDomain(input.email);

  if (verificationStatus === "valid") score += 45;
  else if (verificationStatus === "pending") score += 15;
  else if (verificationStatus === "invalid") score -= 80;

  if (hasName(input)) score += 10;
  if (normalize(input.title)) score += 10;
  if (normalize(input.companyName)) score += 10;
  if (normalize(input.city) || normalize(input.state)) score += 5;

  if (emailDomain.includes(".")) {
    if (FREE_PROVIDER_DOMAINS.has(emailDomain)) score += 3;
    else score += 10;
  } else if (normalize(input.email)) {
    score -= 50;
  }

  if (input.pipeline === "contractor") {
    const trade = normalize(input.trade);
    if (HIGH_DEMAND_TRADES.has(trade)) score += 15;
    else if (trade) score += 5;
  } else {
    const category = normalize(input.category);
    if (HIGH_VALUE_JOB_CATEGORIES.has(category)) score += 15;
    else if (category) score += 5;
  }

  const replyCount = Math.max(0, Number(input.replyCount ?? 0));
  score += getReplyBoost(replyCount);
  score += getReplyRecencyBoost(input.lastRepliedAt);
  if ((input.domainReplyRate ?? 0) > 0.2) score += 15;

  if (input.emailBounced) score -= 50;
  score += getSilencePenalty(input);
  if (input.archived) score -= 10;

  if (verificationStatus === "valid") score = Math.max(score, 60);
  else if (verificationStatus === "pending") score = Math.max(10, Math.min(score, 55));
  else if (verificationStatus === "invalid") score = Math.min(score, 0);

  score = Math.max(-100, Math.min(100, score));
  return { score, bucket: bucketForScore(score) };
}

export async function scoreAndSaveContractorLead(leadId: string): Promise<ScoreResult | null> {
  const [lead] = await db
    .select({
      id: contractorLeads.id,
      contactName: contractorLeads.leadName,
      firstName: contractorLeads.firstName,
      lastName: contractorLeads.lastName,
      title: contractorLeads.title,
      companyName: contractorLeads.businessName,
      city: contractorLeads.city,
      state: contractorLeads.state,
      email: contractorLeads.email,
      website: contractorLeads.website,
      trade: contractorLeads.trade,
      emailBounced: contractorLeads.emailBounced,
      archived: contractorLeads.archived,
      archiveReason: contractorLeads.archiveReason,
      replyCount: contractorLeads.replyCount,
      responseReceived: contractorLeads.responseReceived,
      contactAttempts: contractorLeads.contactAttempts,
      lastContactedAt: contractorLeads.lastContactedAt,
      lastRepliedAt: contractorLeads.lastRepliedAt,
      campaignId: contractorLeads.campaignId,
      prioritySource: contractorLeads.prioritySource,
      emailVerificationStatus: contractorLeads.emailVerificationStatus,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.id, leadId))
    .limit(1);

  if (!lead) return null;
  const domainReplyRate = await getLeadDomainReplyRate({
    campaignId: lead.campaignId,
    website: lead.website,
  });
  const result = calculatePriority({
    pipeline: "contractor",
    verificationStatus: lead.emailVerificationStatus,
    contactName: lead.contactName,
    firstName: lead.firstName,
    lastName: lead.lastName,
    title: lead.title,
    companyName: lead.companyName,
    city: lead.city,
    state: lead.state,
    email: lead.email,
    trade: lead.trade,
    emailBounced: lead.emailBounced,
    archived: lead.archived,
    archiveReason: lead.archiveReason,
    replyCount: lead.replyCount,
    responseReceived: lead.responseReceived,
    contactAttempts: lead.contactAttempts,
    lastContactedAt: lead.lastContactedAt,
    lastRepliedAt: lead.lastRepliedAt,
    domainReplyRate,
  });

  const isManual = lead.prioritySource === "manual";
  await db
    .update(contractorLeads)
    .set({
      priorityScore: result.score,
      leadScore: result.score,
      ...(isManual ? {} : { leadPriority: result.bucket }),
      scoreDirty: false,
      updatedAt: new Date(),
    })
    .where(eq(contractorLeads.id, leadId));

  return result;
}

export async function scoreAndSaveJobPosterLead(leadId: string): Promise<ScoreResult | null> {
  const [lead] = await db
    .select({
      id: jobPosterLeads.id,
      contactName: jobPosterLeads.contactName,
      firstName: jobPosterLeads.firstName,
      lastName: jobPosterLeads.lastName,
      title: jobPosterLeads.title,
      companyName: jobPosterLeads.companyName,
      city: jobPosterLeads.city,
      state: jobPosterLeads.state,
      email: jobPosterLeads.email,
      website: jobPosterLeads.website,
      category: jobPosterLeads.category,
      trade: jobPosterLeads.trade,
      emailBounced: jobPosterLeads.emailBounced,
      archived: jobPosterLeads.archived,
      archiveReason: jobPosterLeads.archiveReason,
      replyCount: jobPosterLeads.replyCount,
      responseReceived: jobPosterLeads.responseReceived,
      contactAttempts: jobPosterLeads.contactAttempts,
      lastContactedAt: jobPosterLeads.lastContactedAt,
      lastRepliedAt: jobPosterLeads.lastRepliedAt,
      campaignId: jobPosterLeads.campaignId,
      prioritySource: jobPosterLeads.prioritySource,
      emailVerificationStatus: jobPosterLeads.emailVerificationStatus,
    })
    .from(jobPosterLeads)
    .where(eq(jobPosterLeads.id, leadId))
    .limit(1);

  if (!lead) return null;
  const domainReplyRate = await getLeadDomainReplyRate({
    campaignId: lead.campaignId,
    website: lead.website,
  });
  const result = calculatePriority({
    pipeline: "jobs",
    verificationStatus: lead.emailVerificationStatus,
    contactName: lead.contactName,
    firstName: lead.firstName,
    lastName: lead.lastName,
    title: lead.title,
    companyName: lead.companyName,
    city: lead.city,
    state: lead.state,
    email: lead.email,
    trade: lead.trade,
    category: lead.category,
    emailBounced: lead.emailBounced,
    archived: lead.archived,
    archiveReason: lead.archiveReason,
    replyCount: lead.replyCount,
    responseReceived: lead.responseReceived,
    contactAttempts: lead.contactAttempts,
    lastContactedAt: lead.lastContactedAt,
    lastRepliedAt: lead.lastRepliedAt,
    domainReplyRate,
  });

  const isManual = lead.prioritySource === "manual";
  await db
    .update(jobPosterLeads)
    .set({
      priorityScore: result.score,
      leadScore: result.score,
      ...(isManual ? {} : { leadPriority: result.bucket }),
      scoreDirty: false,
      updatedAt: new Date(),
    })
    .where(eq(jobPosterLeads.id, leadId));

  return result;
}

export async function markLeadPriorityDirty(pipeline: Pipeline, leadId: string): Promise<void> {
  if (pipeline === "contractor") {
    await db.update(contractorLeads).set({ scoreDirty: true, updatedAt: new Date() }).where(eq(contractorLeads.id, leadId));
    return;
  }
  await db.update(jobPosterLeads).set({ scoreDirty: true, updatedAt: new Date() }).where(eq(jobPosterLeads.id, leadId));
}

export async function rescoreDirtyLeadPriority(limit = 500): Promise<number> {
  const contractorRows = await db
    .select({ id: contractorLeads.id })
    .from(contractorLeads)
    .where(eq(contractorLeads.scoreDirty, true))
    .limit(limit);

  const remaining = Math.max(0, limit - contractorRows.length);
  const jobRows = remaining > 0
    ? await db
      .select({ id: jobPosterLeads.id })
      .from(jobPosterLeads)
      .where(eq(jobPosterLeads.scoreDirty, true))
      .limit(remaining)
    : [];

  for (const row of contractorRows) {
    await scoreAndSaveContractorLead(row.id);
  }
  for (const row of jobRows) {
    await scoreAndSaveJobPosterLead(row.id);
  }

  return contractorRows.length + jobRows.length;
}

export async function rescoreAllLeadPriority(): Promise<number> {
  const contractorRows = await db.select({ id: contractorLeads.id }).from(contractorLeads);
  const jobRows = await db.select({ id: jobPosterLeads.id }).from(jobPosterLeads);

  for (const row of contractorRows) {
    await scoreAndSaveContractorLead(row.id);
  }
  for (const row of jobRows) {
    await scoreAndSaveJobPosterLead(row.id);
  }

  return contractorRows.length + jobRows.length;
}
