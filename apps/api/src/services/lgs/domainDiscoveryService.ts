/**
 * LGS Domain Discovery — 2-Phase Pipeline
 *
 * PHASE 1 (this file): Fast real-time lead creation.
 *   domain → crawl (4 pages) → extract emails → basic reject → rank by prefix → create lead
 *   NO DNS. NO SMTP. NO verification scoring. Just speed.
 *
 * PHASE 2 (emailEnrichmentWorker): Background quality enrichment.
 *   Picks up leads with verification_status = 'pending' and runs DNS/SMTP checks,
 *   updates scores, archives low-quality leads.
 *
 * Terminology:
 *   Emails Found      = all extracted emails before rejection
 *   Rejected Emails   = failed basic rejection rules (regex only)
 *   Inserted Leads    = created (new rows in contractor_leads)
 *   Duplicates Skipped = domain already had a lead
 */
import { eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  discoveryDomainCache,
  discoveryDomainLogs,
  discoveryRunLeads,
  discoveryRuns,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";
import { rankEmailsForDomain } from "@/src/utils/scoreEmailPrefix";

// ─── Constants ───────────────────────────────────────────────────────────────

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const PAGES_TO_CRAWL = ["/", "/contact", "/contact-us", "/about"];
const DOMAIN_CONCURRENCY = 10;
const PAGE_TIMEOUT_MS = 5000;
const MAX_PATTERNS_PER_DOMAIN = 8;

const COMMON_PREFIXES = [
  "info", "contact", "office", "admin", "sales", "service", "hello", "support",
];

const TRADE_KEYWORDS: Array<{ pattern: RegExp; trade: string }> = [
  { pattern: /\broof(ing)?\b/i, trade: "Roofing" },
  { pattern: /\belectric(ian|al)?\b/i, trade: "Electrician" },
  { pattern: /\bplumb(ing|er)?\b/i, trade: "Plumbing" },
  { pattern: /\bheat(ing)?\b/i, trade: "HVAC" },
  { pattern: /\bcool(ing)?\b/i, trade: "HVAC" },
  { pattern: /\bhvac\b/i, trade: "HVAC" },
  { pattern: /\bair.?condition(ing|er)?\b/i, trade: "HVAC" },
  { pattern: /\bpaint(ing|er)?\b/i, trade: "Painting" },
  { pattern: /\bcarpent(ry|er)\b/i, trade: "Carpentry" },
  { pattern: /\bconstruction\b/i, trade: "Construction" },
  { pattern: /\bcontract(ing|or)\b/i, trade: "Contracting" },
  { pattern: /\bremodel(ing)?\b/i, trade: "Remodeling" },
  { pattern: /\bfloor(ing)?\b/i, trade: "Flooring" },
  { pattern: /\blandscap(e|ing)\b/i, trade: "Landscaping" },
  { pattern: /\bconcrete\b/i, trade: "Concrete" },
  { pattern: /\bdrywall\b/i, trade: "Drywall" },
  { pattern: /\bframing\b/i, trade: "Framing" },
  { pattern: /\bmason(ry)?\b/i, trade: "Masonry" },
  { pattern: /\bhandyman\b/i, trade: "Handyman" },
  { pattern: /\bsolar\b/i, trade: "Solar" },
  { pattern: /\bfenc(e|ing)\b/i, trade: "Fencing" },
  { pattern: /\bdeck(ing)?\b/i, trade: "Decking" },
  { pattern: /\binsulat(e|ion)\b/i, trade: "Insulation" },
  { pattern: /\bgutter\b/i, trade: "Gutters" },
  { pattern: /\bpool\b/i, trade: "Pool" },
  { pattern: /\bweld(ing|er)?\b/i, trade: "Welding" },
];

const NOISE_WORDS = /^(home|contact|service area|welcome|services|about|about us|page|main|index|default|untitled)$/i;

const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "aol.com", "icloud.com", "protonmail.com", "mail.com", "ymail.com",
  "msn.com", "me.com", "comcast.net", "sbcglobal.net",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "temp-mail.org", "throwam.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "guerrillamail.info",
  "spam4.me", "trashmail.com", "trashmail.at", "yopmail.com", "fakeinbox.com",
  "dispostable.com", "mailnull.com", "maildrop.cc",
]);

// ─── Utility Functions ──────────────────────────────────────────────────────

export function shouldRejectEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const local = lower.split("@")[0] ?? "";
  const domain = lower.split("@")[1] ?? "";

  const rejectPatterns = [
    "sentry", "example", "test@", "no-reply", "noreply", "donotreply",
    "do-not-reply", "bounce", "mailer-daemon", "postmaster", "abuse@",
    "spam@", "webmaster@", "unsubscribe", "newsletter@",
  ];
  for (const p of rejectPatterns) {
    if (lower.includes(p)) return true;
  }

  if (domain === "domain.com" || domain === "example.com" || domain === "test.com") return true;
  if (/^\d+$/.test(local)) return true;
  if (local.length < 2) return true;

  return false;
}

export function classifyEmailType(
  email: string,
  companyDomain?: string
): "business" | "free_provider" | "disposable" | "unknown" {
  const lower = email.toLowerCase();
  const emailDomain = lower.split("@")[1] ?? "";

  if (DISPOSABLE_DOMAINS.has(emailDomain)) return "disposable";
  if (FREE_EMAIL_PROVIDERS.has(emailDomain)) return "free_provider";
  if (companyDomain) {
    const base = companyDomain.replace(/^www\./, "").toLowerCase();
    if (emailDomain === base) return "business";
  }
  if (emailDomain && emailDomain.includes(".")) return "business";
  return "unknown";
}

function extractEmails(text: string): Set<string> {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return new Set(matches.map((e) => e.trim().toLowerCase()));
}

function extractContactNamesWithRoles(text: string): Array<{ name: string; first: string; last: string }> {
  const names: Array<{ name: string; first: string; last: string }> = [];
  const seen = new Set<string>();
  const patterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[-–—|]\s*([A-Za-z\s]+)/g,
    /<[^>]*>([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)<\/[^>]+>/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const full = m[1].trim();
      const parts = full.split(/\s+/).filter((p) => p.length > 1);
      if (parts.length >= 2 && /^[A-Za-z]+$/.test(parts[0]) && /^[A-Za-z]+$/.test(parts[1]) && !seen.has(full)) {
        seen.add(full);
        names.push({ name: full, first: parts[0], last: parts[1] });
      }
    }
  }
  return names.slice(0, 10);
}

function extractNames(text: string): Array<{ first: string; last: string }> {
  const names: Array<{ first: string; last: string }> = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const clean = line.replace(/<[^>]+>/g, " ").trim();
    const parts = clean.split(/\s+/).filter((p) => p.length > 1);
    if (parts.length >= 2 && /^[A-Za-z]+$/.test(parts[0]) && /^[A-Za-z]+$/.test(parts[1])) {
      names.push({ first: parts[0], last: parts[1] });
    }
  }
  return names.slice(0, 5);
}

function generateEmailCandidates(
  domain: string,
  names: Array<{ first: string; last: string }>
): string[] {
  const candidates = new Set<string>();
  const baseDomain = domain.replace(/^www\./, "");

  for (const prefix of COMMON_PREFIXES) {
    candidates.add(`${prefix}@${baseDomain}`);
    if (candidates.size >= MAX_PATTERNS_PER_DOMAIN) break;
  }

  for (const { first, last } of names) {
    if (candidates.size >= MAX_PATTERNS_PER_DOMAIN) break;
    const f = first.toLowerCase();
    const l = last.toLowerCase();
    const fi = f[0] ?? "";
    candidates.add(`${f}@${baseDomain}`);
    candidates.add(`${f}.${l}@${baseDomain}`);
    candidates.add(`${fi}${l}@${baseDomain}`);
  }

  return Array.from(candidates).slice(0, MAX_PATTERNS_PER_DOMAIN);
}

async function fetchPage(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "8Fold-LGS-Discovery/1.0", Connection: "keep-alive" },
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function cleanBusinessName(raw: string): string {
  const decoded = raw
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .trim();

  const cleaned = decoded
    .replace(/\s*[|–—]\s*.+$/, "")
    .replace(/\s*:\s*.+$/, "")
    .replace(/\s*\/\s*.+$/, "")
    .trim();

  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function extractCompanyName(domain: string, html: string): { name: string; raw: string } {
  function stripNoise(name: string): string {
    const cleaned = name.replace(/<[^>]+>/g, "").trim().slice(0, 400);
    if (NOISE_WORDS.test(cleaned)) return "";
    return cleaned;
  }

  const ogMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  if (ogMatch?.[1]) {
    const raw = ogMatch[1];
    const name = stripNoise(cleanBusinessName(raw));
    if (name) return { name, raw };
  }

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match?.[1]) {
    const raw = h1Match[1];
    const name = stripNoise(cleanBusinessName(raw));
    if (name) return { name, raw };
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const raw = titleMatch[1];
    const name = stripNoise(cleanBusinessName(raw));
    if (name) return { name, raw };
  }

  const fallback = domain.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return { name: fallback, raw: fallback };
}

function detectTradeIndustry(domain: string, html: string): string {
  const combined = `${domain} ${html}`.toLowerCase();
  for (const { pattern, trade } of TRADE_KEYWORDS) {
    if (pattern.test(combined)) return trade;
  }
  return "";
}

function isValidPersonName(name: string): boolean {
  if (!name || name.trim().length < 3) return false;
  const cleaned = name.trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return false;
  if (!parts.every((p) => /^[A-Za-z'-]+$/.test(p))) return false;
  const invalidPatterns = /\b(contact|home|service|area|welcome|about|team|staff|us|page|click|here|menu|nav|footer|header|get|free|call|quote|now)\b/i;
  if (invalidPatterns.test(cleaned)) return false;
  if (parts.some((p) => p.length > 25)) return false;
  return true;
}

function matchEmailToContact(
  email: string,
  contacts: Array<{ name: string; first: string; last: string }>
): string | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local) return null;
  for (const c of contacts) {
    const f = c.first.toLowerCase();
    const l = c.last.toLowerCase();
    const fi = f[0] ?? "";
    if (
      local === f ||
      local === `${f}.${l}` ||
      local === `${fi}${l}` ||
      local === `${f}${l}` ||
      local === `${fi}.${l}`
    ) {
      return c.name;
    }
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type DiscoveryRunResult = {
  runId: string;
  domainsProcessed: number;
  successfulDomains: number;
  emailsFound: number;
  qualifiedEmails: number;
  insertedLeads: number;
  duplicatesSkipped: number;
  rejectedEmails: number;
  domainsDiscarded: number;
  emailsScraped: number;
  emailsPatternGenerated: number;
  emailsVerified: number;
};

export type DiscoveryRunLead = {
  id: string;
  email: string;
  business_name: string | null;
  domain: string | null;
  verification_score: number | null;
  discovery_method: string | null;
  imported: boolean;
  import_status: string | null;
  skip_reason: string | null;
};

type DomainImportMetadata = Record<string, { city?: string; state?: string; country?: string }>;
type CampaignType = "contractor" | "jobs";
type StoredImportDomainMetadata = Record<string, unknown> & {
  __queued_rows?: DomainImportRow[];
};

type RunContext = {
  importMeta: DomainImportMetadata;
  source: string;
  defaultCampaignType: CampaignType;
  existingDomains: Record<CampaignType, Set<string>>;
  insertedDomains: Record<CampaignType, Set<string>>;
};

export type DomainImportRow = {
  domain: string;
  category?: string;
  campaignType?: CampaignType;
  city?: string;
  state?: string;
  country?: string;
  targetLeadId?: string;
};

function normalizeDomain(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .trim()
    .toLowerCase();
}

function isValidNormalizedDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain) && !domain.includes("..");
}

function sanitizeDomainImportRow(row: DomainImportRow): DomainImportRow | null {
  const domain = normalizeDomain(row.domain);
  if (!domain || !isValidNormalizedDomain(domain)) {
    console.warn("[LGS] Invalid domain skipped during queueing:", row.domain);
    return null;
  }
  return {
    ...row,
    domain,
  };
}

function decodeQueuedRows(value: unknown): DomainImportRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const queued = (value as StoredImportDomainMetadata).__queued_rows;
  if (!Array.isArray(queued)) return [];
  return queued
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const candidate = sanitizeDomainImportRow({
        domain: String((row as DomainImportRow).domain ?? ""),
        category: (row as DomainImportRow).category,
        campaignType: (row as DomainImportRow).campaignType,
        city: (row as DomainImportRow).city,
        state: (row as DomainImportRow).state,
        country: (row as DomainImportRow).country,
        targetLeadId: (row as DomainImportRow).targetLeadId,
      });
      return candidate;
    })
    .filter((row): row is DomainImportRow => row !== null);
}

// ─── Lead Creation (FAST — no verification) ──────────────────────────────────

async function nextContractorLeadNumber(): Promise<number> {
  const seqResult = await db.execute(
    sql`SELECT nextval('directory_engine.contractor_leads_lead_number_seq') AS n`
  );
  return Number(((seqResult.rows ?? seqResult) as Array<{ n: string }>)[0].n);
}

function resolveCampaignType(
  domainRow: Pick<DomainImportRow, "campaignType">,
  ctx: Pick<RunContext, "defaultCampaignType">
): CampaignType {
  return domainRow.campaignType ?? ctx.defaultCampaignType ?? "contractor";
}

async function createLeadForDomain(
  domainRow: DomainImportRow,
  emails: string[],
  companyName: string,
  industry: string,
  contactName: string | null,
  ctx: RunContext
): Promise<{ inserted: boolean; duplicate: boolean }> {
  const domain = domainRow.domain;
  const campaignType = resolveCampaignType(domainRow, ctx);
  const hasTargetLead = Boolean(domainRow.targetLeadId);

  if (!hasTargetLead && ctx.existingDomains[campaignType].has(domain)) {
    console.log(`[LGS] Duplicate skipped (pre-existing): ${domain}`);
    return { inserted: false, duplicate: true };
  }
  if (!hasTargetLead && ctx.insertedDomains[campaignType].has(domain)) {
    console.log(`[LGS] Duplicate skipped (in-run): ${domain}`);
    return { inserted: false, duplicate: true };
  }

  const ranked = rankEmailsForDomain(emails);
  if (ranked.length === 0) return { inserted: false, duplicate: false };

  const primary = ranked[0];
  const secondaries = ranked.slice(1);
  const emailType = classifyEmailType(primary.email, domain);
  const locationMeta = ctx.importMeta[domain] ?? {};

  if (campaignType === "jobs") {
    if (domainRow.targetLeadId) {
      await db
        .update(jobPosterLeads)
        .set({
          email: primary.email,
          companyName: companyName || undefined,
          contactName: contactName && isValidPersonName(contactName) ? contactName : undefined,
          trade: industry || undefined,
          city: locationMeta.city ?? undefined,
          state: locationMeta.state ?? undefined,
          country: locationMeta.country ?? "US",
          source: ctx.source,
          needsEnrichment: false,
          assignmentStatus: "ready",
          emailVerificationStatus: "pending",
          emailVerificationScore: null,
          emailVerificationCheckedAt: null,
          emailVerificationProvider: null,
          status: "new",
          archived: false,
          archivedAt: null,
          archiveReason: null,
          scoreDirty: true,
          updatedAt: new Date(),
        })
        .where(eq(jobPosterLeads.id, domainRow.targetLeadId));
    } else {
      await db.insert(jobPosterLeads).values({
        website: domain,
        companyName: companyName || null,
        contactName: contactName && isValidPersonName(contactName) ? contactName : null,
        email: primary.email,
        category: domainRow.category ?? "business",
        trade: industry || null,
        city: locationMeta.city ?? null,
        state: locationMeta.state ?? null,
        country: locationMeta.country ?? "US",
        source: ctx.source,
        needsEnrichment: false,
        assignmentStatus: "ready",
        emailVerificationStatus: "pending",
        emailVerificationScore: null,
        emailVerificationCheckedAt: null,
        emailVerificationProvider: null,
        status: "new",
        archived: false,
        archivedAt: null,
        archiveReason: null,
      });
      ctx.insertedDomains[campaignType].add(domain);
    }
    return { inserted: true, duplicate: false };
  }

  if (domainRow.targetLeadId) {
    await db
      .update(contractorLeads)
      .set({
        email: primary.email,
        emailType,
        primaryEmailScore: primary.score,
        secondaryEmails:
          secondaries.length > 0
            ? secondaries.map((e) => ({ email: e.email, score: e.score }))
            : null,
        leadName: contactName && isValidPersonName(contactName) ? contactName : undefined,
        businessName: companyName || undefined,
        scrapedBusinessName: companyName || undefined,
        trade: industry || undefined,
        city: locationMeta.city ?? undefined,
        state: locationMeta.state ?? undefined,
        country: locationMeta.country ?? "US",
        source: ctx.source,
        leadSource: ctx.source,
        discoveryMethod: "scraped_email",
        needsEnrichment: false,
        assignmentStatus: "ready",
        verificationScore: 0,
        verificationStatus: "pending",
        verificationSource: null,
        emailVerificationStatus: "pending",
        emailVerificationScore: null,
        emailVerificationCheckedAt: null,
        emailVerificationProvider: null,
        archived: false,
        archivedAt: null,
        archiveReason: null,
        scoreDirty: true,
        updatedAt: new Date(),
      })
      .where(eq(contractorLeads.id, domainRow.targetLeadId));
  } else {
    const leadNumber = await nextContractorLeadNumber();

    await db.insert(contractorLeads).values({
      leadNumber,
      email: primary.email,
      emailType,
      primaryEmailScore: primary.score,
      secondaryEmails:
        secondaries.length > 0
          ? secondaries.map((e) => ({ email: e.email, score: e.score }))
          : null,
      leadName: contactName && isValidPersonName(contactName) ? contactName : null,
      businessName: companyName || null,
      scrapedBusinessName: companyName || null,
      website: domain || null,
      trade: industry || null,
      city: locationMeta.city ?? null,
      state: locationMeta.state ?? null,
      country: locationMeta.country ?? "US",
      source: ctx.source,
      leadSource: ctx.source,
      discoveryMethod: "scraped_email",
      verificationScore: 0,
      verificationStatus: "pending",
      verificationSource: null,
      archived: false,
      archivedAt: null,
    });

    ctx.insertedDomains[campaignType].add(domain);
  }

  return { inserted: true, duplicate: false };
}

// ─── Progress Updates ────────────────────────────────────────────────────────

async function updateRunProgress(
  runId: string,
  delta: {
    domainsProcessed?: number;
    successfulDomains?: number;
    emailsFound?: number;
    qualifiedEmails?: number;
    insertedLeads?: number;
    duplicatesSkipped?: number;
    rejectedEmails?: number;
    domainsDiscarded?: number;
    failedDomains?: number;
    skippedDomains?: number;
    emailsScraped?: number;
    emailsPatternGenerated?: number;
    emailsVerified?: number;
    contactsFound?: number;
  }
) {
  const set: Record<string, unknown> = {};
  if (delta.domainsProcessed != null) set.domainsProcessed = sql`coalesce(${discoveryRuns.domainsProcessed}, 0) + ${delta.domainsProcessed}`;
  if (delta.successfulDomains != null) set.successfulDomains = sql`coalesce(${discoveryRuns.successfulDomains}, 0) + ${delta.successfulDomains}`;
  if (delta.emailsFound != null) set.emailsFound = sql`coalesce(${discoveryRuns.emailsFound}, 0) + ${delta.emailsFound}`;
  if (delta.qualifiedEmails != null) set.qualifiedEmails = sql`coalesce(${discoveryRuns.qualifiedEmails}, 0) + ${delta.qualifiedEmails}`;
  if (delta.insertedLeads != null) set.insertedLeads = sql`coalesce(${discoveryRuns.insertedLeads}, 0) + ${delta.insertedLeads}`;
  if (delta.duplicatesSkipped != null) set.duplicatesSkipped = sql`coalesce(${discoveryRuns.duplicatesSkipped}, 0) + ${delta.duplicatesSkipped}`;
  if (delta.rejectedEmails != null) set.rejectedEmails = sql`coalesce(${discoveryRuns.rejectedEmails}, 0) + ${delta.rejectedEmails}`;
  if (delta.domainsDiscarded != null) set.domainsDiscarded = sql`coalesce(${discoveryRuns.domainsDiscarded}, 0) + ${delta.domainsDiscarded}`;
  if (delta.failedDomains != null) set.failedDomains = sql`coalesce(${discoveryRuns.failedDomains}, 0) + ${delta.failedDomains}`;
  if (delta.skippedDomains != null) set.skippedDomains = sql`coalesce(${discoveryRuns.skippedDomains}, 0) + ${delta.skippedDomains}`;
  if (delta.emailsScraped != null) set.emailsScraped = sql`coalesce(${discoveryRuns.emailsScraped}, 0) + ${delta.emailsScraped}`;
  if (delta.emailsPatternGenerated != null) set.emailsPatternGenerated = sql`coalesce(${discoveryRuns.emailsPatternGenerated}, 0) + ${delta.emailsPatternGenerated}`;
  if (delta.emailsVerified != null) set.emailsVerified = sql`coalesce(${discoveryRuns.emailsVerified}, 0) + ${delta.emailsVerified}`;
  if (delta.contactsFound != null) set.contactsFound = sql`coalesce(${discoveryRuns.contactsFound}, 0) + ${delta.contactsFound}`;
  set.status = sql`case when ${discoveryRuns.status} = 'stalled' then 'running' else ${discoveryRuns.status} end`;
  if (Object.keys(set).length > 0) {
    await db.update(discoveryRuns).set(set as Record<string, unknown>).where(eq(discoveryRuns.id, runId));
  }
}

// ─── Phase 1: Fast Domain Processing ─────────────────────────────────────────

async function processSingleDomain(
  runId: string,
  domainRow: DomainImportRow,
  ctx: RunContext
): Promise<void> {
  const baseDomain = domainRow.domain.replace(/^www\./, "");
  console.log("[LGS] Processing domain:", baseDomain, { runId, campaignType: resolveCampaignType(domainRow, ctx) });

  // ── 1. Fetch targeted pages in parallel ────────────────────────────────────
  const pageResults = await Promise.allSettled(
    PAGES_TO_CRAWL.map((p) => fetchPage(`https://${baseDomain}${p}`))
  );

  let html = "";
  const allEmails = new Set<string>();

  for (const r of pageResults) {
    if (r.status === "fulfilled" && r.value) {
      html += r.value;
      extractEmails(r.value).forEach((e) => allEmails.add(e));
    }
  }

  if (!html) {
    await Promise.allSettled([
      db.insert(discoveryDomainLogs).values({ runId, domain: baseDomain, emailsFound: 0, status: "error" }).catch(() => {}),
      updateRunProgress(runId, { domainsProcessed: 1, failedDomains: 1 }),
    ]);
    return;
  }

  // ── 2. Extract metadata from HTML ──────────────────────────────────────────
  const scrapedCount = allEmails.size;
  const { name: companyName } = extractCompanyName(baseDomain, html);
  const industry = detectTradeIndustry(baseDomain, html);
  const contactsWithRoles = extractContactNamesWithRoles(html);
  const fallbackNames =
    contactsWithRoles.length > 0
      ? contactsWithRoles.map((c) => ({ first: c.first, last: c.last }))
      : extractNames(html);

  // Pattern-generate emails if crawl found zero
  let emailsPatternGeneratedDelta = 0;
  if (allEmails.size === 0) {
    const candidates = generateEmailCandidates(baseDomain, fallbackNames);
    for (const c of candidates) allEmails.add(c);
    emailsPatternGeneratedDelta = candidates.length;
  }

  const emailsFoundCount = allEmails.size;

  // ── 3. Basic rejection (regex only — NO DNS, NO SMTP) ─────────────────────
  const validEmails: string[] = [];
  let rejectedCount = 0;

  for (const email of allEmails) {
    if (shouldRejectEmail(email)) {
      rejectedCount++;
    } else {
      validEmails.push(email);
    }
  }

  if (validEmails.length === 0) {
    await Promise.allSettled([
      db.insert(discoveryDomainLogs).values({ runId, domain: baseDomain, emailsFound: emailsFoundCount, status: "discarded" }).catch(() => {}),
      updateRunProgress(runId, {
        domainsProcessed: 1,
        domainsDiscarded: 1,
        emailsFound: emailsFoundCount,
        rejectedEmails: rejectedCount,
      }),
    ]);
    return;
  }

  // ── 4. Match best contact name ─────────────────────────────────────────────
  let bestContactName: string | null = null;
  for (const email of validEmails) {
    const match = matchEmailToContact(email, contactsWithRoles);
    if (match) { bestContactName = match; break; }
  }

  // ── 5. Create lead immediately ─────────────────────────────────────────────
  let inserted = false;
  let duplicate = false;

  try {
    ({ inserted, duplicate } = await createLeadForDomain(
      { ...domainRow, domain: baseDomain }, validEmails, companyName, industry, bestContactName, ctx
    ));
  } catch (err) {
    console.error(`[LGS] createLeadForDomain failed (${baseDomain}):`, err instanceof Error ? err.message : err);
  }

  // ── 6. Log to history tables (non-fatal) ───────────────────────────────────
  const ranked = rankEmailsForDomain(validEmails);
  const primaryEmail = ranked[0]?.email ?? validEmails[0];
  const campaignType = resolveCampaignType(domainRow, ctx);

  await Promise.allSettled(
    validEmails.map(async (email) => {
      const isPrimary = email.toLowerCase() === primaryEmail.toLowerCase();
      await db
        .insert(discoveryRunLeads)
        .values({
          runId,
          domain: baseDomain,
          email,
          businessName: companyName,
          contactName: bestContactName && isValidPersonName(bestContactName) ? bestContactName : null,
          industry: industry || null,
          verificationScore: 0,
          discoveryMethod: scrapedCount > 0 ? "scraped_email" : "pattern_generated",
          campaignType,
          imported: true,
          importStatus: duplicate ? "skipped_duplicate" : isPrimary ? "inserted" : "consolidated_secondary",
          skipReason: duplicate ? "duplicate_domain" : isPrimary ? null : "consolidated_secondary",
        })
        .onConflictDoNothing();
    })
  );

  const now = new Date();
  await Promise.allSettled([
    db
      .insert(discoveryDomainCache)
      .values({ domain: baseDomain, lastDiscoveredAt: now })
      .onConflictDoUpdate({ target: discoveryDomainCache.domain, set: { lastDiscoveredAt: now } }),
    db.insert(discoveryDomainLogs).values({
      runId, domain: baseDomain, emailsFound: validEmails.length, status: inserted ? "success" : "duplicate",
    }),
  ]);

  // ── 7. Update live counters ────────────────────────────────────────────────
  try {
    await updateRunProgress(runId, {
      domainsProcessed: 1,
      successfulDomains: 1,
      emailsFound: emailsFoundCount,
      qualifiedEmails: validEmails.length,
      insertedLeads: inserted ? 1 : 0,
      duplicatesSkipped: duplicate ? 1 : 0,
      rejectedEmails: rejectedCount,
      emailsScraped: scrapedCount,
      emailsPatternGenerated: emailsPatternGeneratedDelta,
    });
  } catch {
    // Counter write failure is never fatal
  }
}

// ─── Run Orchestration ───────────────────────────────────────────────────────

async function processDiscoveryRun(runId: string, domainRows: DomainImportRow[]): Promise<void> {
  const limit = pLimit(DOMAIN_CONCURRENCY);

  const [runRecord] = await db
    .select({
      autoImportSource: discoveryRuns.autoImportSource,
      campaignType: discoveryRuns.campaignType,
      importDomainMetadata: discoveryRuns.importDomainMetadata,
    })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, runId))
    .limit(1);

  const importMeta = ((runRecord?.importDomainMetadata ?? {}) as DomainImportMetadata);
  const source = runRecord?.autoImportSource ?? "website_import";
  const defaultCampaignType = (runRecord?.campaignType === "jobs" ? "jobs" : "contractor") as CampaignType;

  // Pre-fetch existing domains once — no per-domain DB round-trips
  const domainList = domainRows.map((r) => r.domain.replace(/^www\./, "").toLowerCase());
  const existingContractorRows = domainList.length > 0
    ? await db
        .select({ website: contractorLeads.website })
        .from(contractorLeads)
        .where(inArray(contractorLeads.website, domainList))
    : [];
  const existingJobPosterRows = domainList.length > 0
    ? await db
        .select({ website: jobPosterLeads.website })
        .from(jobPosterLeads)
        .where(inArray(jobPosterLeads.website, domainList))
    : [];
  const existingDomains = {
    contractor: new Set(
      existingContractorRows.map((r) => (r.website ?? "").toLowerCase()).filter(Boolean)
    ),
    jobs: new Set(
      existingJobPosterRows.map((r) => (r.website ?? "").toLowerCase()).filter(Boolean)
    ),
  };
  const existingCount =
    existingDomains.contractor.size + existingDomains.jobs.size;

  console.log(
    `[LGS] Run ${runId}: ${domainRows.length} domains to process, ${existingCount} already in DB (will be skipped as duplicates)`
  );

  const ctx: RunContext = {
    importMeta,
    source,
    defaultCampaignType,
    existingDomains,
    insertedDomains: {
      contractor: new Set<string>(),
      jobs: new Set<string>(),
    },
  };

  let isCancelled = false;
  const CHECK_EVERY = 10;
  const checkForCancellation = async (): Promise<boolean> => {
    if (isCancelled) return true;
    const [row] = await db
      .select({ status: discoveryRuns.status })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .limit(1);
    if (row?.status === "cancel_requested") isCancelled = true;
    return isCancelled;
  };

  await Promise.all(
    domainRows.map((domainRow, idx) =>
      limit(async () => {
        if (isCancelled) return;
        if (idx % CHECK_EVERY === 0) {
          if (await checkForCancellation()) return;
        }
        try {
          await processSingleDomain(runId, domainRow, ctx);
        } catch (err) {
          console.error(`[LGS] Domain failed (${domainRow.domain}): ${err instanceof Error ? err.message : err}`);
          try {
            await updateRunProgress(runId, { domainsProcessed: 1, failedDomains: 1 });
          } catch {
            // never stop the loop
          }
        }
      })
    )
  );

  const finishedAt = new Date();

  if (isCancelled) {
    await db
      .update(discoveryRuns)
      .set({ status: "cancelled", finishedAt })
      .where(eq(discoveryRuns.id, runId));
    console.log(`[LGS] Discovery run ${runId} cancelled — leads created up to this point are kept.`);
    return;
  }

  const [finalCounts] = await db
    .select({ processed: discoveryRuns.domainsProcessed, failed: discoveryRuns.failedDomains, startedAt: discoveryRuns.startedAt })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, runId))
    .limit(1);

  const totalProcessed = finalCounts?.processed ?? 0;
  const totalFailed = finalCounts?.failed ?? 0;
  const elapsedMs = finalCounts?.startedAt
    ? finishedAt.getTime() - finalCounts.startedAt.getTime()
    : null;

  const finalStatus =
    totalProcessed === 0
      ? "failed"
      : totalFailed > 0
        ? "complete_with_errors"
        : "complete";

  await db
    .update(discoveryRuns)
    .set({ status: finalStatus, finishedAt, elapsedMs: elapsedMs ?? undefined })
    .where(eq(discoveryRuns.id, runId));

  console.log(
    `[LGS] Discovery run ${runId} → ${finalStatus}. ` +
    `Processed: ${totalProcessed}, Failed: ${totalFailed}, ElapsedMs: ${elapsedMs}`
  );
}

async function claimDiscoveryRun(runId: string): Promise<"claimed" | "already_running" | "not_found" | "not_claimable"> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE directory_engine.discovery_runs
    SET
      status = 'running',
      started_at = COALESCE(started_at, NOW()),
      finished_at = NULL
    WHERE id = ${runId}
      AND COALESCE(status, 'pending') IN ('pending', 'stalled')
    RETURNING id
  `);

  const claimed = (result as { rows?: Array<{ id: string }> }).rows ?? [];
  if (claimed.length > 0) return "claimed";

  const [run] = await db
    .select({ status: discoveryRuns.status })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, runId))
    .limit(1);

  if (!run) return "not_found";
  if (run.status === "running") return "already_running";
  return "not_claimable";
}

export async function processDiscoveryRunById(runId: string): Promise<{
  ok: boolean;
  status: "claimed" | "already_running" | "not_found" | "not_claimable";
  queuedDomains: number;
}> {
  const [run] = await db
    .select({
      importDomainMetadata: discoveryRuns.importDomainMetadata,
      status: discoveryRuns.status,
    })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, runId))
    .limit(1);

  if (!run) {
    return { ok: false, status: "not_found", queuedDomains: 0 };
  }

  const queuedRows = decodeQueuedRows(run.importDomainMetadata);
  if (queuedRows.length === 0) {
    console.error("[LGS] Discovery run has no queued rows to process", { runId });
    await db
      .update(discoveryRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(discoveryRuns.id, runId));
    return { ok: false, status: "not_claimable", queuedDomains: 0 };
  }

  const claimStatus = await claimDiscoveryRun(runId);
  if (claimStatus !== "claimed") {
    return {
      ok: claimStatus === "already_running",
      status: claimStatus,
      queuedDomains: queuedRows.length,
    };
  }

  console.log("[LGS] Scan job started", runId, { queuedDomains: queuedRows.length });

  try {
    await processDiscoveryRun(runId, queuedRows);
    return { ok: true, status: "claimed", queuedDomains: queuedRows.length };
  } catch (err) {
    console.error("[LGS] Discovery run crashed:", err);
    try {
      const [row] = await db
        .select({ status: discoveryRuns.status })
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, runId))
        .limit(1);
      if (row && row.status === "running") {
        await db
          .update(discoveryRuns)
          .set({ status: "failed", finishedAt: new Date() })
          .where(eq(discoveryRuns.id, runId));
      }
    } catch (finalizeErr) {
      console.error("[LGS] Could not finalize run:", finalizeErr);
    }
    throw err;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function runBulkDomainDiscoveryAsync(
  rows: DomainImportRow[] | string[],
  opts?: {
    autoImportSource?: string;
    campaignType?: CampaignType;
    targetCampaignId?: string;
    targetCategory?: string;
  }
): Promise<string> {
  const normalizedRows: DomainImportRow[] = rows.map((r) => {
    if (typeof r === "string") {
      return { domain: r };
    }
    return { ...r };
  }).map((row) => sanitizeDomainImportRow(row)).filter((row): row is DomainImportRow => row !== null);

  const seenDomains = new Set<string>();
  const uniqueRows: DomainImportRow[] = [];
  for (const row of normalizedRows) {
    if (row.domain && !seenDomains.has(row.domain)) {
      seenDomains.add(row.domain);
      uniqueRows.push(row);
    }
  }

  const importDomainMetadata: DomainImportMetadata = {};
  for (const row of uniqueRows) {
    if (row.city || row.state || row.country) {
      importDomainMetadata[row.domain] = {
        city: row.city,
        state: row.state,
        country: row.country,
      };
    }
  }

  const storedImportMetadata: StoredImportDomainMetadata = {
    ...importDomainMetadata,
    __queued_rows: uniqueRows,
  };

  const defaultCampaignType = opts?.campaignType ?? uniqueRows[0]?.campaignType ?? "contractor";

  const [run] = await db
    .insert(discoveryRuns)
    .values({
      domainsTotal: uniqueRows.length,
      domainsProcessed: 0,
      successfulDomains: 0,
      emailsFound: 0,
      qualifiedEmails: 0,
      insertedLeads: 0,
      duplicatesSkipped: 0,
      rejectedEmails: 0,
      domainsDiscarded: 0,
      failedDomains: 0,
      skippedDomains: 0,
      emailsScraped: 0,
      emailsPatternGenerated: 0,
      emailsVerified: 0,
      emailsImported: 0,
      autoImportSource: opts?.autoImportSource ?? null,
      campaignType: defaultCampaignType,
      targetCampaignId: opts?.targetCampaignId ?? null,
      targetCategory: opts?.targetCategory ?? null,
      importDomainMetadata: storedImportMetadata,
      status: "pending",
    })
    .returning();

  if (!run) throw new Error("Failed to create discovery run");
  const runId = run.id;

  return runId;
}

// ─── Legacy import function (kept for backward compat) ───────────────────────

export async function importDiscoveryLeads(
  runId: string,
  leadIds: string[],
  source: string = "domain_discovery"
): Promise<{ imported: number; duplicates: number }> {
  if (leadIds.length === 0) return { imported: 0, duplicates: 0 };

  const [run] = await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, runId)).limit(1);
  const importMeta = (run?.importDomainMetadata ?? {}) as DomainImportMetadata;
  const defaultCampaignType = (run?.campaignType === "jobs" ? "jobs" : "contractor") as CampaignType;

  const rows = await db
    .select()
    .from(discoveryRunLeads)
    .where(eq(discoveryRunLeads.runId, runId));

  const idSet = new Set(leadIds);
  const eligibleRows = rows.filter((r) => idSet.has(r.id) && !r.imported);
  if (eligibleRows.length === 0) return { imported: 0, duplicates: 0 };

  const byDomain = new Map<string, typeof eligibleRows>();
  for (const row of eligibleRows) {
    const domain = (row.domain ?? "").toLowerCase().trim();
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(row);
  }

  const domainsToCheck = [...byDomain.keys()].filter(Boolean);
  const existingContractorDomainRows = domainsToCheck.length > 0
    ? await db
        .select({ website: contractorLeads.website })
        .from(contractorLeads)
        .where(inArray(contractorLeads.website, domainsToCheck))
    : [];
  const existingJobPosterDomainRows = domainsToCheck.length > 0
    ? await db
        .select({ website: jobPosterLeads.website })
        .from(jobPosterLeads)
        .where(inArray(jobPosterLeads.website, domainsToCheck))
    : [];
  const existingDomains = {
    contractor: new Set(existingContractorDomainRows.map((r) => (r.website ?? "").toLowerCase())),
    jobs: new Set(existingJobPosterDomainRows.map((r) => (r.website ?? "").toLowerCase())),
  };
  const insertedDomains = {
    contractor: new Set<string>(),
    jobs: new Set<string>(),
  };

  let imported = 0;
  let duplicates = 0;

  for (const [domain, domainRows] of byDomain) {
    const campaignType = (domainRows[0]?.campaignType === "jobs" ? "jobs" : defaultCampaignType) as CampaignType;
    if (existingDomains[campaignType].has(domain) || insertedDomains[campaignType].has(domain)) {
      for (const row of domainRows) {
        await db
          .update(discoveryRunLeads)
          .set({ imported: true, importStatus: "skipped_duplicate", skipReason: "duplicate_domain" })
          .where(eq(discoveryRunLeads.id, row.id));
        duplicates++;
      }
      continue;
    }

    const ranked = rankEmailsForDomain(domainRows.map((r) => r.email));
    if (ranked.length === 0) {
      for (const row of domainRows) {
        await db
          .update(discoveryRunLeads)
          .set({ imported: true, importStatus: "skipped_rejected", skipReason: "all_emails_rejected" })
          .where(eq(discoveryRunLeads.id, row.id));
        duplicates++;
      }
      continue;
    }

    const primaryEntry = ranked[0];
    const secondaryEntries = ranked.slice(1);
    const primaryRow = domainRows.find(
      (r) => r.email.toLowerCase() === primaryEntry.email.toLowerCase()
    ) ?? domainRows[0];
    const locationMeta = importMeta[domain] ?? {};
    const emailType = classifyEmailType(primaryEntry.email.toLowerCase(), domain || undefined);

    if (campaignType === "jobs") {
      await db.insert(jobPosterLeads).values({
        website: domain,
        companyName: primaryRow.businessName ?? null,
        contactName:
          primaryRow.contactName && isValidPersonName(primaryRow.contactName)
            ? primaryRow.contactName
            : null,
        email: primaryEntry.email,
        category: run?.targetCategory ?? "business",
        trade: primaryRow.industry ?? null,
        city: locationMeta.city ?? null,
        state: locationMeta.state ?? null,
        country: locationMeta.country ?? "US",
        source,
        needsEnrichment: false,
        assignmentStatus: "ready",
        emailVerificationStatus: "pending",
        emailVerificationScore: null,
        emailVerificationCheckedAt: null,
        emailVerificationProvider: null,
        status: "new",
        archived: false,
        archivedAt: null,
        archiveReason: null,
      });
    } else {
      const leadNumber = await nextContractorLeadNumber();

      await db.insert(contractorLeads).values({
        leadNumber,
        email: primaryEntry.email,
        emailType,
        primaryEmailScore: primaryEntry.score,
        secondaryEmails: secondaryEntries.length > 0
          ? secondaryEntries.map((e) => ({ email: e.email, score: e.score }))
          : null,
        leadName: primaryRow.contactName && isValidPersonName(primaryRow.contactName) ? primaryRow.contactName : null,
        businessName: primaryRow.businessName ?? null,
        scrapedBusinessName: primaryRow.businessName ?? null,
        website: domain || null,
        trade: primaryRow.industry ?? null,
        city: locationMeta.city ?? null,
        state: locationMeta.state ?? null,
        country: locationMeta.country ?? "US",
        source,
        leadSource: source,
        discoveryMethod: primaryRow.discoveryMethod ?? "scraped_email",
        verificationScore: 0,
        verificationStatus: "pending",
        verificationSource: null,
      });
    }

    await db
      .update(discoveryRunLeads)
      .set({ imported: true, importStatus: "inserted" })
      .where(eq(discoveryRunLeads.id, primaryRow.id));

    for (const row of domainRows) {
      if (row.id !== primaryRow.id) {
        await db
          .update(discoveryRunLeads)
          .set({ imported: true, importStatus: "skipped_duplicate", skipReason: "consolidated_secondary" })
          .where(eq(discoveryRunLeads.id, row.id));
        duplicates++;
      }
    }

    insertedDomains[campaignType].add(domain);
    imported++;
  }

  await db
    .update(discoveryRuns)
    .set({
      emailsImported: sql`coalesce(${discoveryRuns.emailsImported}, 0) + ${imported}`,
      insertedLeads: sql`coalesce(${discoveryRuns.insertedLeads}, 0) + ${imported}`,
      duplicatesSkipped: sql`coalesce(${discoveryRuns.duplicatesSkipped}, 0) + ${duplicates}`,
    })
    .where(eq(discoveryRuns.id, runId));

  return { imported, duplicates };
}
