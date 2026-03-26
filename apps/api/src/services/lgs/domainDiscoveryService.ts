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
import { lookup } from "node:dns/promises";
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

const ROOT_PAGE_PATH = "/";
const DEFAULT_PRIORITY_PATHS = ["/contact", "/about"];
const DOMAIN_CONCURRENCY = 8;
const DISCOVERY_BATCH_SIZE = 40;
const DISCOVERY_INVOCATION_BUDGET_MS = 35_000;
const DISCOVERY_STALE_THRESHOLD_MS = 60_000;
const PREFILTER_TIMEOUT_MS = 1500;
const PREFILTER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_TIMEOUT_MS = 3500;
const PAGE_FETCH_MAX_ATTEMPTS = 2;
const DOMAIN_MAX_ATTEMPTS = 2;
const MAX_EXTRA_INTERNAL_LINKS = 3;
const MAX_PATTERNS_PER_DOMAIN = 4;

const COMMON_PREFIXES = [
  "info", "contact", "hello", "admin",
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
  void names;
  const candidates = new Set<string>();
  const baseDomain = domain.replace(/^www\./, "");

  for (const prefix of COMMON_PREFIXES) {
    candidates.add(`${prefix}@${baseDomain}`);
    if (candidates.size >= MAX_PATTERNS_PER_DOMAIN) break;
  }

  return Array.from(candidates).slice(0, MAX_PATTERNS_PER_DOMAIN);
}

async function fetchPage(url: string, attempt = 1): Promise<string> {
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
    if (attempt < PAGE_FETCH_MAX_ATTEMPTS) {
      return fetchPage(url, attempt + 1);
    }
    return "";
  }
}

async function fetchDomainHtml(
  baseDomain: string,
  preferredOrigin?: string | null
): Promise<{
  html: string;
  emails: Set<string>;
  emailSources: Map<string, EmailConfidenceSource>;
  structuredData: StructuredDataSummary;
}> {
  const candidateOrigins = [
    ...(preferredOrigin ? [preferredOrigin] : []),
    ...buildCandidateOrigins(baseDomain).filter((origin) => origin !== preferredOrigin),
  ];

  let originUsed = "";
  let homepageHtml = "";
  let html = "";
  const emails = new Set<string>();
  const emailSources = new Map<string, EmailConfidenceSource>();
  let structuredData: StructuredDataSummary = {
    companyName: null,
    email: null,
    phone: null,
    city: null,
    state: null,
    country: null,
  };

  const addEmails = (sourceHtml: string, source: EmailConfidenceSource) => {
    for (const email of extractEmails(sourceHtml)) {
      emails.add(email);
      if (!emailSources.has(email)) emailSources.set(email, source);
    }
  };

  for (const origin of candidateOrigins) {
    const rootHtml = await fetchPage(`${origin}${ROOT_PAGE_PATH}`);
    if (!rootHtml) continue;
    originUsed = origin;
    homepageHtml = rootHtml;
    html += rootHtml;
    addEmails(rootHtml, "discovered");
    for (const email of extractMailtoEmails(rootHtml)) {
      emails.add(email);
      emailSources.set(email, "discovered");
    }
    structuredData = extractStructuredDataSummary(rootHtml);
    if (structuredData.email) {
      emails.add(structuredData.email);
      emailSources.set(structuredData.email, "discovered");
    }
    break;
  }

  if (!originUsed) {
    return { html: "", emails, emailSources, structuredData };
  }

  const prioritizedUrls = prioritizeInternalLinks(originUsed, homepageHtml);
  const shouldExpand =
    emails.size === 0 ||
    !hasText(structuredData.companyName) ||
    !hasText(structuredData.city) ||
    !hasText(structuredData.state);

  if (shouldExpand) {
    const secondaryUrls = prioritizedUrls.slice(0, DEFAULT_PRIORITY_PATHS.length + MAX_EXTRA_INTERNAL_LINKS);
    const secondaryResults = await Promise.allSettled(
      secondaryUrls.map(async (url) => ({ url, body: await fetchPage(url) }))
    );
    for (const result of secondaryResults) {
      if (result.status !== "fulfilled" || !result.value.body) continue;
      html += result.value.body;
      addEmails(result.value.body, "discovered");
      for (const email of extractMailtoEmails(result.value.body)) {
        emails.add(email);
        emailSources.set(email, "discovered");
      }
      const pageStructured = extractStructuredDataSummary(result.value.body);
      structuredData = {
        companyName: structuredData.companyName ?? pageStructured.companyName,
        email: structuredData.email ?? pageStructured.email,
        phone: structuredData.phone ?? pageStructured.phone,
        city: structuredData.city ?? pageStructured.city,
        state: structuredData.state ?? pageStructured.state,
        country: structuredData.country ?? pageStructured.country,
      };
      if (pageStructured.email) {
        emails.add(pageStructured.email);
        emailSources.set(pageStructured.email, "discovered");
      }
      if (emails.size > 0 && hasText(structuredData.companyName) && (hasText(structuredData.city) || hasText(structuredData.state))) {
        break;
      }
    }
  }

  return { html, emails, emailSources, structuredData };
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
  __queue_cursor?: number;
};

type ExistingContractorLead = {
  id: string;
  website: string | null;
  email: string | null;
  leadName: string | null;
  businessName: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type ExistingJobPosterLead = {
  id: string;
  website: string | null;
  email: string | null;
  companyName: string | null;
  contactName: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  processingStatus: string | null;
};

type DomainCacheRecord = {
  domain: string;
  lastDiscoveredAt: Date;
  reachable: boolean | null;
  lastStatusCode: number | null;
  lastContentType: string | null;
  lastResponseTimeMs: number | null;
};

type EmailConfidenceSource = "discovered" | "guessed";

type StructuredDataSummary = {
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type DomainPrefilterOutcome = {
  origin: string | null;
  reachable: boolean;
  statusCode: number | null;
  contentType: string | null;
  responseTimeMs: number | null;
  skipReason: string | null;
  skipBucket: "failed" | "skipped" | null;
  fromCache: boolean;
};

type RunContext = {
  importMeta: DomainImportMetadata;
  source: string;
  defaultCampaignType: CampaignType;
  existingDomains: Record<CampaignType, Set<string>>;
  existingLeadRecords: {
    contractor: Map<string, ExistingContractorLead>;
    jobs: Map<string, ExistingJobPosterLead>;
  };
  domainCacheRecords: Map<string, DomainCacheRecord>;
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

function readStoredImportMetadata(value: unknown): StoredImportDomainMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as StoredImportDomainMetadata;
}

function readQueueCursor(value: unknown): number {
  const rawCursor = readStoredImportMetadata(value).__queue_cursor;
  if (typeof rawCursor !== "number" || !Number.isFinite(rawCursor) || rawCursor < 0) {
    return 0;
  }
  return Math.floor(rawCursor);
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value && value.trim());
}

function normalizeContentType(value: string | null | undefined): string | null {
  if (!hasText(value)) return null;
  return value.split(";")[0]?.trim().toLowerCase() ?? null;
}

function isLikelyHtmlContentType(value: string | null | undefined): boolean {
  const normalized = normalizeContentType(value);
  if (!normalized) return true;
  return normalized.includes("text/html") || normalized.includes("application/xhtml+xml");
}

function buildCandidateOrigins(baseDomain: string): string[] {
  return [
    `https://${baseDomain}`,
    `http://${baseDomain}`,
    ...(baseDomain.startsWith("www.") ? [] : [`https://www.${baseDomain}`, `http://www.${baseDomain}`]),
  ];
}

function toAbsoluteInternalUrl(origin: string, href: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
  try {
    const parsed = new URL(href, origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (normalizeDomain(parsed.hostname) !== normalizeDomain(new URL(origin).hostname)) return null;
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractMailtoEmails(html: string): string[] {
  const matches = html.match(/mailto:([^"'?#\s>]+)/gi) ?? [];
  return matches
    .map((match) => match.replace(/^mailto:/i, "").trim().toLowerCase())
    .filter(Boolean);
}

function extractInternalLinks(origin: string, html: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const absolute = toAbsoluteInternalUrl(origin, match[1] ?? "");
    if (!absolute || seen.has(absolute)) continue;
    seen.add(absolute);
    links.push(absolute);
  }

  return links;
}

function prioritizeInternalLinks(origin: string, homepageHtml: string): string[] {
  const priority = new Set<string>();
  const ordered: string[] = [];
  const push = (value: string | null) => {
    if (!value || priority.has(value)) return;
    priority.add(value);
    ordered.push(value);
  };

  for (const path of DEFAULT_PRIORITY_PATHS) {
    push(`${origin}${path}`);
  }

  const footerMatch = homepageHtml.match(/<footer[\s\S]*?<\/footer>/i);
  if (footerMatch?.[0]) {
    for (const link of extractInternalLinks(origin, footerMatch[0])) {
      push(link);
    }
  }

  for (const link of extractInternalLinks(origin, homepageHtml)) {
    push(link);
    if (ordered.length >= DEFAULT_PRIORITY_PATHS.length + MAX_EXTRA_INTERNAL_LINKS + 4) break;
  }

  return ordered.slice(0, DEFAULT_PRIORITY_PATHS.length + MAX_EXTRA_INTERNAL_LINKS + 4);
}

function extractStructuredDataSummary(html: string): StructuredDataSummary {
  const summary: StructuredDataSummary = {
    companyName: null,
    email: null,
    phone: null,
    city: null,
    state: null,
    country: null,
  };

  const visit = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "string") return;
    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (!summary.companyName && hasText(typeof record.name === "string" ? record.name : null)) {
      summary.companyName = cleanBusinessName(String(record.name));
    }
    if (!summary.email && hasText(typeof record.email === "string" ? record.email : null)) {
      summary.email = String(record.email).replace(/^mailto:/i, "").trim().toLowerCase();
    }
    if (!summary.phone && hasText(typeof record.telephone === "string" ? record.telephone : null)) {
      summary.phone = String(record.telephone).trim();
    }

    const address = record.address;
    if (address && typeof address === "object" && !Array.isArray(address)) {
      const structuredAddress = address as Record<string, unknown>;
      if (!summary.city && hasText(typeof structuredAddress.addressLocality === "string" ? structuredAddress.addressLocality : null)) {
        summary.city = String(structuredAddress.addressLocality).trim();
      }
      if (!summary.state && hasText(typeof structuredAddress.addressRegion === "string" ? structuredAddress.addressRegion : null)) {
        summary.state = String(structuredAddress.addressRegion).trim();
      }
      if (!summary.country && hasText(typeof structuredAddress.addressCountry === "string" ? structuredAddress.addressCountry : null)) {
        summary.country = String(structuredAddress.addressCountry).trim();
      }
    }

    Object.values(record).forEach(visit);
  };

  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of blocks) {
    const jsonMatch = block.match(/>([\s\S]*?)<\/script>/i);
    if (!jsonMatch?.[1]) continue;
    try {
      visit(JSON.parse(jsonMatch[1].trim()));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return summary;
}

function mergeLocation(
  primary: { city?: string | null; state?: string | null; country?: string | null },
  secondary: { city?: string | null; state?: string | null; country?: string | null }
): { city?: string; state?: string; country?: string } {
  return {
    city: hasText(primary.city ?? null) ? primary.city ?? undefined : secondary.city ?? undefined,
    state: hasText(primary.state ?? null) ? primary.state ?? undefined : secondary.state ?? undefined,
    country: hasText(primary.country ?? null) ? primary.country ?? undefined : secondary.country ?? undefined,
  };
}

function scoreLocation(location: { city?: string | null; state?: string | null; country?: string | null }): number {
  return hasText(location.city ?? null) || hasText(location.state ?? null) || hasText(location.country ?? null) ? 2 : 0;
}

function emailConfidence(source: EmailConfidenceSource | null | undefined, email: string | null | undefined): number {
  if (!hasText(email ?? null)) return 0;
  return source === "guessed" ? 2 : 5;
}

function computeLeadScore(args: {
  email: string | null | undefined;
  emailSource?: EmailConfidenceSource | null;
  contactName?: string | null;
  trade?: string | null;
  location?: { city?: string | null; state?: string | null; country?: string | null };
}): number {
  return (
    emailConfidence(args.emailSource ?? "discovered", args.email) +
    (hasText(args.contactName ?? null) ? 3 : 0) +
    (hasText(args.trade ?? null) ? 2 : 0) +
    scoreLocation(args.location ?? {})
  );
}

function deriveProcessingStatus(score: number, email: string | null | undefined): "new" | "enriching" | "processed" {
  if (score >= 7) return "processed";
  if (hasText(email ?? null) || score > 0) return "enriching";
  return "new";
}

async function upsertDomainCache(
  domain: string,
  update: Pick<DomainCacheRecord, "reachable" | "lastStatusCode" | "lastContentType" | "lastResponseTimeMs">
) {
  const lastDiscoveredAt = new Date();
  await db
    .insert(discoveryDomainCache)
    .values({
      domain,
      lastDiscoveredAt,
      reachable: update.reachable,
      lastStatusCode: update.lastStatusCode,
      lastContentType: update.lastContentType,
      lastResponseTimeMs: update.lastResponseTimeMs,
    })
    .onConflictDoUpdate({
      target: discoveryDomainCache.domain,
      set: {
        lastDiscoveredAt,
        reachable: update.reachable,
        lastStatusCode: update.lastStatusCode,
        lastContentType: update.lastContentType,
        lastResponseTimeMs: update.lastResponseTimeMs,
      },
    });
}

async function prefilterRequest(
  origin: string,
  method: "HEAD" | "GET"
): Promise<{ statusCode: number | null; contentType: string | null; responseTimeMs: number | null; ok: boolean }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREFILTER_TIMEOUT_MS);

  try {
    const response = await fetch(`${origin}${ROOT_PAGE_PATH}`, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "8Fold-LGS-Discovery/1.0", Connection: "keep-alive" },
    });
    clearTimeout(timeout);
    const contentType = normalizeContentType(response.headers.get("content-type"));
    const responseTimeMs = Date.now() - startedAt;
    if (method === "GET") {
      const cancelled = response.body?.cancel();
      if (cancelled) {
        await cancelled.catch(() => undefined);
      }
    }
    return {
      statusCode: response.status,
      contentType,
      responseTimeMs,
      ok: response.ok && response.status < 500 && isLikelyHtmlContentType(contentType),
    };
  } catch {
    clearTimeout(timeout);
    return { statusCode: null, contentType: null, responseTimeMs: null, ok: false };
  }
}

async function prefilterDomain(baseDomain: string, ctx: RunContext): Promise<DomainPrefilterOutcome> {
  const cached = ctx.domainCacheRecords.get(baseDomain);
  const cacheIsFresh =
    cached?.lastDiscoveredAt instanceof Date &&
    Date.now() - cached.lastDiscoveredAt.getTime() < PREFILTER_CACHE_TTL_MS;

  if (cacheIsFresh && cached) {
    const cachedHtmlOkay = cached.reachable === true && (cached.lastStatusCode ?? 200) < 500 && isLikelyHtmlContentType(cached.lastContentType);
    if (cachedHtmlOkay) {
      return {
        origin: buildCandidateOrigins(baseDomain)[0] ?? null,
        reachable: true,
        statusCode: cached.lastStatusCode,
        contentType: cached.lastContentType,
        responseTimeMs: cached.lastResponseTimeMs,
        skipReason: null,
        skipBucket: null,
        fromCache: true,
      };
    }

    return {
      origin: null,
      reachable: Boolean(cached.reachable),
      statusCode: cached.lastStatusCode,
      contentType: cached.lastContentType,
      responseTimeMs: cached.lastResponseTimeMs,
      skipReason: cached.reachable === false ? "recent_dns_or_network_failure" : "recent_prefilter_skip",
      skipBucket: cached.reachable === false ? "failed" : "skipped",
      fromCache: true,
    };
  }

  try {
    await lookup(baseDomain);
  } catch {
    await upsertDomainCache(baseDomain, {
      reachable: false,
      lastStatusCode: null,
      lastContentType: null,
      lastResponseTimeMs: null,
    });
    return {
      origin: null,
      reachable: false,
      statusCode: null,
      contentType: null,
      responseTimeMs: null,
      skipReason: "dns_unresolved",
      skipBucket: "failed",
      fromCache: false,
    };
  }

  let bestFailure: DomainPrefilterOutcome = {
    origin: null,
    reachable: false,
    statusCode: null,
    contentType: null,
    responseTimeMs: null,
    skipReason: "no_response",
    skipBucket: "skipped",
    fromCache: false,
  };

  for (const origin of buildCandidateOrigins(baseDomain)) {
    const headResult = await prefilterRequest(origin, "HEAD");
    if (headResult.ok) {
      await upsertDomainCache(baseDomain, {
        reachable: true,
        lastStatusCode: headResult.statusCode,
        lastContentType: headResult.contentType,
        lastResponseTimeMs: headResult.responseTimeMs,
      });
      return {
        origin,
        reachable: true,
        statusCode: headResult.statusCode,
        contentType: headResult.contentType,
        responseTimeMs: headResult.responseTimeMs,
        skipReason: null,
        skipBucket: null,
        fromCache: false,
      };
    }

    const needsRetryGet =
      headResult.statusCode === null ||
      headResult.statusCode >= 500 ||
      !isLikelyHtmlContentType(headResult.contentType);

    if (needsRetryGet) {
      const getResult = await prefilterRequest(origin, "GET");
      if (getResult.ok) {
        await upsertDomainCache(baseDomain, {
          reachable: true,
          lastStatusCode: getResult.statusCode,
          lastContentType: getResult.contentType,
          lastResponseTimeMs: getResult.responseTimeMs,
        });
        return {
          origin,
          reachable: true,
          statusCode: getResult.statusCode,
          contentType: getResult.contentType,
          responseTimeMs: getResult.responseTimeMs,
          skipReason: null,
          skipBucket: null,
          fromCache: false,
        };
      }

      bestFailure = {
        origin: null,
        reachable: getResult.statusCode !== null,
        statusCode: getResult.statusCode,
        contentType: getResult.contentType,
        responseTimeMs: getResult.responseTimeMs,
        skipReason:
          getResult.statusCode === null
            ? "no_response"
            : getResult.statusCode >= 500
              ? "upstream_5xx"
              : "non_html_content",
        skipBucket: getResult.statusCode === null ? "failed" : "skipped",
        fromCache: false,
      };
      continue;
    }

    bestFailure = {
      origin: null,
      reachable: headResult.statusCode !== null,
      statusCode: headResult.statusCode,
      contentType: headResult.contentType,
      responseTimeMs: headResult.responseTimeMs,
      skipReason: headResult.statusCode && headResult.statusCode >= 400 ? `status_${headResult.statusCode}` : "prefilter_rejected",
      skipBucket: headResult.statusCode && headResult.statusCode >= 500 ? "failed" : "skipped",
      fromCache: false,
    };
  }

  await upsertDomainCache(baseDomain, {
    reachable: bestFailure.reachable,
    lastStatusCode: bestFailure.statusCode,
    lastContentType: bestFailure.contentType,
    lastResponseTimeMs: bestFailure.responseTimeMs,
  });

  return bestFailure;
}

async function persistDiscoveryCheckpoint(
  runId: string,
  storedImportMetadata: StoredImportDomainMetadata,
  queuedRows: DomainImportRow[],
  nextCursor: number,
  status: "running" | "pending"
) {
  await db
    .update(discoveryRuns)
    .set({
      status,
      finishedAt: null,
      importDomainMetadata: {
        ...storedImportMetadata,
        __queued_rows: queuedRows,
        __queue_cursor: nextCursor,
      },
    })
    .where(eq(discoveryRuns.id, runId));
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
  emailSources: Map<string, EmailConfidenceSource>,
  companyName: string,
  industry: string,
  contactName: string | null,
  extractedLocation: { city?: string | null; state?: string | null; country?: string | null },
  ctx: RunContext
): Promise<{ inserted: boolean; duplicate: boolean }> {
  const domain = domainRow.domain;
  const campaignType = resolveCampaignType(domainRow, ctx);
  const hasTargetLead = Boolean(domainRow.targetLeadId);
  const locationMeta = mergeLocation(ctx.importMeta[domain] ?? {}, extractedLocation);

  if (!hasTargetLead && ctx.insertedDomains[campaignType].has(domain)) {
    console.log(`[LGS] Duplicate skipped (in-run): ${domain}`);
    return { inserted: false, duplicate: true };
  }

  const ranked = rankEmailsForDomain(emails);
  if (ranked.length === 0) return { inserted: false, duplicate: false };

  const primary = ranked[0];
  const secondaries = ranked.slice(1);
  const emailType = classifyEmailType(primary.email, domain);
  const primarySource = emailSources.get(primary.email) ?? "discovered";
  const primaryScore = computeLeadScore({
    email: primary.email,
    emailSource: primarySource,
    contactName,
    trade: industry,
    location: locationMeta,
  });
  const existingLead = ctx.existingLeadRecords[campaignType].get(domain);

  if (!hasTargetLead && existingLead) {
    if (campaignType === "jobs") {
      const existingJobLead = existingLead as ExistingJobPosterLead;
      const existingScore = computeLeadScore({
        email: existingJobLead.email,
        emailSource: "discovered",
        contactName: existingJobLead.contactName,
        trade: existingJobLead.trade,
        location: existingJobLead,
      });
      const patch: Partial<typeof jobPosterLeads.$inferInsert> = {
        updatedAt: new Date(),
        scoreDirty: true,
      };
      if (!hasText(existingJobLead.email)) patch.email = primary.email;
      if (!hasText(existingJobLead.companyName) && hasText(companyName)) patch.companyName = companyName;
      if (!hasText(existingJobLead.contactName) && contactName && isValidPersonName(contactName)) patch.contactName = contactName;
      if (!hasText(existingJobLead.trade) && hasText(industry)) patch.trade = industry;
      if (!hasText(existingJobLead.city) && hasText(locationMeta.city)) patch.city = locationMeta.city;
      if (!hasText(existingJobLead.state) && hasText(locationMeta.state)) patch.state = locationMeta.state;
      if (!hasText(existingJobLead.country) && hasText(locationMeta.country)) patch.country = locationMeta.country;
      const nextScore = computeLeadScore({
        email: patch.email ?? existingJobLead.email,
        emailSource: hasText(existingJobLead.email) ? "discovered" : primarySource,
        contactName: patch.contactName ?? existingJobLead.contactName,
        trade: patch.trade ?? existingJobLead.trade,
        location: {
          city: patch.city ?? existingJobLead.city,
          state: patch.state ?? existingJobLead.state,
          country: patch.country ?? existingJobLead.country,
        },
      });
      if (nextScore > existingScore) {
        patch.processingStatus = deriveProcessingStatus(nextScore, patch.email ?? existingJobLead.email);
        patch.needsEnrichment = nextScore < 7;
        await db.update(jobPosterLeads).set(patch).where(eq(jobPosterLeads.id, existingJobLead.id));
        console.log("[LGS] Refreshed existing job poster lead", {
          domain,
          existingScore,
          nextScore,
          primarySource,
        });
      } else {
        console.log("[LGS] Duplicate skipped (pre-existing job lead)", {
          domain,
          existingScore,
          nextScore,
        });
      }
    } else {
      const existingContractorLead = existingLead as ExistingContractorLead;
      const existingScore = computeLeadScore({
        email: existingContractorLead.email,
        emailSource: "discovered",
        contactName: existingContractorLead.leadName,
        trade: existingContractorLead.trade,
        location: existingContractorLead,
      });
      const patch: Partial<typeof contractorLeads.$inferInsert> = {
        updatedAt: new Date(),
        scoreDirty: true,
      };
      if (!hasText(existingContractorLead.email)) {
        patch.email = primary.email;
        patch.emailType = emailType;
        patch.primaryEmailScore = primary.score;
        patch.secondaryEmails =
          secondaries.length > 0
            ? secondaries.map((email) => ({ email: email.email, score: email.score }))
            : null;
      }
      if (!hasText(existingContractorLead.businessName) && hasText(companyName)) {
        patch.businessName = companyName;
        patch.scrapedBusinessName = companyName;
      }
      if (!hasText(existingContractorLead.leadName) && contactName && isValidPersonName(contactName)) patch.leadName = contactName;
      if (!hasText(existingContractorLead.trade) && hasText(industry)) patch.trade = industry;
      if (!hasText(existingContractorLead.city) && hasText(locationMeta.city)) patch.city = locationMeta.city;
      if (!hasText(existingContractorLead.state) && hasText(locationMeta.state)) patch.state = locationMeta.state;
      if (!hasText(existingContractorLead.country) && hasText(locationMeta.country)) patch.country = locationMeta.country;
      const nextScore = computeLeadScore({
        email: patch.email ?? existingContractorLead.email,
        emailSource: hasText(existingContractorLead.email) ? "discovered" : primarySource,
        contactName: patch.leadName ?? existingContractorLead.leadName,
        trade: patch.trade ?? existingContractorLead.trade,
        location: {
          city: patch.city ?? existingContractorLead.city,
          state: patch.state ?? existingContractorLead.state,
          country: patch.country ?? existingContractorLead.country,
        },
      });
      if (nextScore > existingScore) {
        await db.update(contractorLeads).set(patch).where(eq(contractorLeads.id, existingContractorLead.id));
        console.log("[LGS] Refreshed existing contractor lead", {
          domain,
          existingScore,
          nextScore,
          primarySource,
        });
      } else {
        console.log("[LGS] Duplicate skipped (pre-existing contractor lead)", {
          domain,
          existingScore,
          nextScore,
        });
      }
    }
    return { inserted: false, duplicate: true };
  }

  if (campaignType === "jobs") {
    const processingStatus = deriveProcessingStatus(primaryScore, primary.email);
    const needsEnrichment = primaryScore < 7;
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
          needsEnrichment,
          assignmentStatus: "ready",
          emailVerificationStatus: "pending",
          emailVerificationScore: null,
          emailVerificationCheckedAt: null,
          emailVerificationProvider: null,
          status: "new",
          processingStatus,
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
        needsEnrichment,
        assignmentStatus: "ready",
        emailVerificationStatus: "pending",
        emailVerificationScore: null,
        emailVerificationCheckedAt: null,
        emailVerificationProvider: null,
        status: "new",
        processingStatus,
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
        discoveryMethod: primarySource === "guessed" ? "pattern_generated" : "scraped_email",
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
      discoveryMethod: primarySource === "guessed" ? "pattern_generated" : "scraped_email",
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
  ctx: RunContext,
  attempt = 1
): Promise<void> {
  const baseDomain = domainRow.domain.replace(/^www\./, "");
  const startedAt = Date.now();
  const campaignType = resolveCampaignType(domainRow, ctx);
  console.log("[LGS] Processing domain", { runId, domain: baseDomain, campaignType, attempt });

  const prefilter = await prefilterDomain(baseDomain, ctx);
  if (prefilter.skipReason) {
    await Promise.allSettled([
      db.insert(discoveryDomainLogs).values({
        runId,
        domain: baseDomain,
        emailsFound: 0,
        status: prefilter.skipBucket === "failed" ? "error" : "skipped",
      }).catch(() => {}),
      updateRunProgress(runId, {
        domainsProcessed: 1,
        failedDomains: prefilter.skipBucket === "failed" ? 1 : 0,
        skippedDomains: prefilter.skipBucket === "skipped" ? 1 : 0,
      }),
    ]);
    console.log("[LGS] Domain prefilter skipped", {
      runId,
      domain: baseDomain,
      skipReason: prefilter.skipReason,
      fromCache: prefilter.fromCache,
    });
    return;
  }

  const { html, emails: allEmails, emailSources, structuredData } = await fetchDomainHtml(baseDomain, prefilter.origin);

  if (!html) {
    if (attempt < DOMAIN_MAX_ATTEMPTS) {
      console.warn("[LGS] Retrying unreachable domain", {
        runId,
        domain: baseDomain,
        attempt,
      });
      return processSingleDomain(runId, domainRow, ctx, attempt + 1);
    }
    await Promise.allSettled([
      db.insert(discoveryDomainLogs).values({ runId, domain: baseDomain, emailsFound: 0, status: "error" }).catch(() => {}),
      updateRunProgress(runId, { domainsProcessed: 1, failedDomains: 1 }),
    ]);
    return;
  }

  const scrapedCount = allEmails.size;
  const { name: extractedCompanyName } = extractCompanyName(baseDomain, html);
  const companyName = structuredData.companyName ?? extractedCompanyName;
  const industry = detectTradeIndustry(baseDomain, html);
  const extractedLocation = {
    city: structuredData.city,
    state: structuredData.state,
    country: structuredData.country,
  };
  const contactsWithRoles = extractContactNamesWithRoles(html);
  const fallbackNames =
    contactsWithRoles.length > 0
      ? contactsWithRoles.map((c) => ({ first: c.first, last: c.last }))
      : extractNames(html);

  let emailsPatternGeneratedDelta = 0;
  if (allEmails.size === 0) {
    const candidates = generateEmailCandidates(baseDomain, fallbackNames);
    for (const candidate of candidates) {
      allEmails.add(candidate);
      if (!emailSources.has(candidate)) emailSources.set(candidate, "guessed");
    }
    emailsPatternGeneratedDelta = candidates.length;
  }

  const emailsFoundCount = allEmails.size;
  const validEmails: string[] = [];
  let rejectedCount = 0;

  for (const email of allEmails) {
    if (shouldRejectEmail(email)) {
      rejectedCount++;
    } else {
      validEmails.push(email);
    }
  }

  const preferredEmails = validEmails.filter((email) => (emailSources.get(email) ?? "discovered") === "discovered");
  const emailsForInsert = preferredEmails.length > 0 ? preferredEmails : validEmails;

  if (emailsForInsert.length === 0) {
    await Promise.allSettled([
      db.insert(discoveryDomainLogs).values({ runId, domain: baseDomain, emailsFound: emailsFoundCount, status: "discarded" }).catch(() => {}),
      updateRunProgress(runId, {
        domainsProcessed: 1,
        domainsDiscarded: 1,
        emailsFound: emailsFoundCount,
        rejectedEmails: rejectedCount,
      }),
    ]);
    console.log("[LGS] Domain discarded", {
      runId,
      domain: baseDomain,
      skipReason: "no_usable_email",
      emailsFoundCount,
      rejectedCount,
    });
    return;
  }

  let bestContactName: string | null = null;
  for (const email of emailsForInsert) {
    const match = matchEmailToContact(email, contactsWithRoles);
    if (match) {
      bestContactName = match;
      break;
    }
  }

  let inserted = false;
  let duplicate = false;

  try {
    ({ inserted, duplicate } = await createLeadForDomain(
      { ...domainRow, domain: baseDomain },
      emailsForInsert,
      emailSources,
      companyName,
      industry,
      bestContactName,
      extractedLocation,
      ctx
    ));
  } catch (err) {
    console.error(`[LGS] createLeadForDomain failed (${baseDomain}):`, err instanceof Error ? err.message : err);
  }

  const ranked = rankEmailsForDomain(emailsForInsert);
  const primaryEmail = ranked[0]?.email ?? emailsForInsert[0];

  await Promise.allSettled(
    emailsForInsert.map(async (email) => {
      const isPrimary = email.toLowerCase() === primaryEmail.toLowerCase();
      const source = emailSources.get(email) ?? "discovered";
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
          discoveryMethod: source === "guessed" ? "pattern_generated" : "scraped_email",
          campaignType,
          imported: true,
          importStatus: duplicate ? "skipped_duplicate" : isPrimary ? "inserted" : "consolidated_secondary",
          skipReason: duplicate ? "duplicate_domain" : isPrimary ? null : "consolidated_secondary",
        })
        .onConflictDoNothing();
    })
  );

  await Promise.allSettled([
    upsertDomainCache(baseDomain, {
      reachable: true,
      lastStatusCode: prefilter.statusCode,
      lastContentType: prefilter.contentType,
      lastResponseTimeMs: prefilter.responseTimeMs,
    }),
    db.insert(discoveryDomainLogs).values({
      runId,
      domain: baseDomain,
      emailsFound: emailsForInsert.length,
      status: inserted ? "success" : "duplicate",
    }),
  ]);

  try {
    await updateRunProgress(runId, {
      domainsProcessed: 1,
      successfulDomains: 1,
      emailsFound: emailsFoundCount,
      qualifiedEmails: emailsForInsert.length,
      insertedLeads: inserted ? 1 : 0,
      duplicatesSkipped: duplicate ? 1 : 0,
      rejectedEmails: rejectedCount,
      emailsScraped: scrapedCount,
      emailsPatternGenerated: emailsPatternGeneratedDelta,
      contactsFound: bestContactName ? 1 : 0,
    });
  } catch {
    // Counter write failure is never fatal
  }

  console.log("[LGS] Domain processed", {
    runId,
    domain: baseDomain,
    inserted,
    duplicate,
    emailsFound: emailsFoundCount,
    usableEmails: emailsForInsert.length,
    avgDomainMs: Date.now() - startedAt,
    primarySource: emailSources.get(primaryEmail) ?? "discovered",
    contactFound: Boolean(bestContactName),
  });
}

// ─── Run Orchestration ───────────────────────────────────────────────────────

async function processDiscoveryRun(runId: string, domainRows: DomainImportRow[]): Promise<boolean> {
  const limit = pLimit(DOMAIN_CONCURRENCY);
  const batchStartedAt = Date.now();

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
        .select({
          id: contractorLeads.id,
          website: contractorLeads.website,
          email: contractorLeads.email,
          leadName: contractorLeads.leadName,
          businessName: contractorLeads.businessName,
          trade: contractorLeads.trade,
          city: contractorLeads.city,
          state: contractorLeads.state,
          country: contractorLeads.country,
        })
        .from(contractorLeads)
        .where(inArray(contractorLeads.website, domainList))
    : [];
  const existingJobPosterRows = domainList.length > 0
    ? await db
        .select({
          id: jobPosterLeads.id,
          website: jobPosterLeads.website,
          email: jobPosterLeads.email,
          companyName: jobPosterLeads.companyName,
          contactName: jobPosterLeads.contactName,
          trade: jobPosterLeads.trade,
          city: jobPosterLeads.city,
          state: jobPosterLeads.state,
          country: jobPosterLeads.country,
          processingStatus: jobPosterLeads.processingStatus,
        })
        .from(jobPosterLeads)
        .where(inArray(jobPosterLeads.website, domainList))
    : [];
  const domainCacheRows = domainList.length > 0
    ? await db
        .select({
          domain: discoveryDomainCache.domain,
          lastDiscoveredAt: discoveryDomainCache.lastDiscoveredAt,
          reachable: discoveryDomainCache.reachable,
          lastStatusCode: discoveryDomainCache.lastStatusCode,
          lastContentType: discoveryDomainCache.lastContentType,
          lastResponseTimeMs: discoveryDomainCache.lastResponseTimeMs,
        })
        .from(discoveryDomainCache)
        .where(inArray(discoveryDomainCache.domain, domainList))
    : [];
  const existingDomains = {
    contractor: new Set(
      existingContractorRows.map((r) => (r.website ?? "").toLowerCase()).filter(Boolean)
    ),
    jobs: new Set(
      existingJobPosterRows.map((r) => (r.website ?? "").toLowerCase()).filter(Boolean)
    ),
  };
  const existingCount = existingDomains.contractor.size + existingDomains.jobs.size;

  console.log("[LGS] Discovery batch claimed", {
    runId,
    batchSize: domainRows.length,
    existingCount,
    cachedDomains: domainCacheRows.length,
  });

  const ctx: RunContext = {
    importMeta,
    source,
    defaultCampaignType,
    existingDomains,
    existingLeadRecords: {
      contractor: new Map(
        existingContractorRows
          .map((row) => [row.website?.toLowerCase() ?? "", row] as const)
          .filter(([domain]) => Boolean(domain))
      ),
      jobs: new Map(
        existingJobPosterRows
          .map((row) => [row.website?.toLowerCase() ?? "", row] as const)
          .filter(([domain]) => Boolean(domain))
      ),
    },
    domainCacheRecords: new Map(
      domainCacheRows
        .filter((row) => row.domain && row.lastDiscoveredAt)
        .map((row) => [row.domain.toLowerCase(), row] as const)
    ),
    insertedDomains: {
      contractor: new Set<string>(),
      jobs: new Set<string>(),
    },
  };

  let isCancelled = false;
  let completedCount = 0;
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
          completedCount++;
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

  const elapsedMs = Date.now() - batchStartedAt;
  console.log("[LGS] Discovery batch finished", {
    runId,
    batchSize: domainRows.length,
    completedCount,
    avgDomainMs: domainRows.length > 0 ? Math.round(elapsedMs / domainRows.length) : 0,
    throughputPerMinute: elapsedMs > 0 ? Math.round((completedCount / elapsedMs) * 60_000) : 0,
  });

  if (isCancelled) {
    const finishedAt = new Date();
    await db
      .update(discoveryRuns)
      .set({ status: "cancelled", finishedAt })
      .where(eq(discoveryRuns.id, runId));
    console.log(`[LGS] Discovery run ${runId} cancelled — leads created up to this point are kept.`);
    return true;
  }

  return false;
}

async function finalizeDiscoveryRun(runId: string): Promise<void> {
  const finishedAt = new Date();
  const [finalCounts] = await db
    .select({
      processed: discoveryRuns.domainsProcessed,
      failed: discoveryRuns.failedDomains,
      startedAt: discoveryRuns.startedAt,
    })
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

async function requeueStaleRunningDiscoveryRuns(): Promise<string[]> {
  const staleCutoff = new Date(Date.now() - DISCOVERY_STALE_THRESHOLD_MS);
  const staleRuns = await db.execute<{ id: string }>(sql`
    WITH last_activity AS (
      SELECT
        r.id,
        GREATEST(
          COALESCE(MAX(l.created_at), to_timestamp(0)),
          COALESCE(r.started_at, r.created_at, to_timestamp(0))
        ) AS last_activity_at
      FROM directory_engine.discovery_runs r
      LEFT JOIN directory_engine.discovery_domain_logs l
        ON l.run_id = r.id
      WHERE r.status = 'running'
      GROUP BY r.id, r.started_at, r.created_at
    )
    UPDATE directory_engine.discovery_runs r
    SET status = 'pending'
    FROM last_activity a
    WHERE r.id = a.id
      AND a.last_activity_at < ${staleCutoff}
    RETURNING r.id
  `);

  return ((staleRuns as { rows?: Array<{ id: string }> }).rows ?? []).map((row) => row.id);
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
  remainingDomains: number;
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
    return { ok: false, status: "not_found", queuedDomains: 0, remainingDomains: 0 };
  }

  const storedImportMetadata = readStoredImportMetadata(run.importDomainMetadata);
  const queuedRows = decodeQueuedRows(storedImportMetadata);
  const queueCursor = readQueueCursor(storedImportMetadata);
  if (queuedRows.length === 0) {
    console.error("[LGS] Discovery run has no queued rows to process", { runId });
    await db
      .update(discoveryRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(discoveryRuns.id, runId));
    return { ok: false, status: "not_claimable", queuedDomains: 0, remainingDomains: 0 };
  }

  const claimStatus = await claimDiscoveryRun(runId);
  if (claimStatus !== "claimed") {
    return {
      ok: claimStatus === "already_running",
      status: claimStatus,
      queuedDomains: queuedRows.length,
      remainingDomains: Math.max(0, queuedRows.length - queueCursor),
    };
  }

  let nextCursor = queueCursor;
  if (nextCursor >= queuedRows.length) {
    await finalizeDiscoveryRun(runId);
    return { ok: true, status: "claimed", queuedDomains: queuedRows.length, remainingDomains: 0 };
  }

  console.log("[LGS] Scan job started", runId, {
    queuedDomains: queuedRows.length,
    queueCursor,
  });

  try {
    const invocationStartedAt = Date.now();
    let wasCancelled = false;

    while (nextCursor < queuedRows.length) {
      const nextBatch = queuedRows.slice(nextCursor, nextCursor + DISCOVERY_BATCH_SIZE);
      if (nextBatch.length === 0) break;

      wasCancelled = await processDiscoveryRun(runId, nextBatch);
      nextCursor += nextBatch.length;

      await persistDiscoveryCheckpoint(runId, storedImportMetadata, queuedRows, nextCursor, "running");

      if (wasCancelled) {
        break;
      }

      if (Date.now() - invocationStartedAt >= DISCOVERY_INVOCATION_BUDGET_MS) {
        break;
      }
    }

    const remainingDomains = Math.max(0, queuedRows.length - nextCursor);

    if (wasCancelled) {
      return { ok: true, status: "claimed", queuedDomains: queuedRows.length, remainingDomains };
    }

    if (remainingDomains > 0) {
      await persistDiscoveryCheckpoint(runId, storedImportMetadata, queuedRows, nextCursor, "pending");

      console.log("[LGS] Discovery run batch complete, re-queued remaining domains", {
        runId,
        nextCursor,
        remainingDomains,
      });

      return { ok: true, status: "claimed", queuedDomains: queuedRows.length, remainingDomains };
    }

    await finalizeDiscoveryRun(runId);
    return { ok: true, status: "claimed", queuedDomains: queuedRows.length, remainingDomains: 0 };
  } catch (err) {
    console.error("[LGS] Discovery run crashed:", err);
    try {
      await persistDiscoveryCheckpoint(runId, storedImportMetadata, queuedRows, nextCursor, "pending");
      console.warn("[LGS] Discovery run re-queued after crash", {
        runId,
        nextCursor,
        remainingDomains: Math.max(0, queuedRows.length - nextCursor),
      });
    } catch (finalizeErr) {
      console.error("[LGS] Could not finalize run:", finalizeErr);
    }
    throw err;
  }
}

export async function processNextQueuedDiscoveryRun(): Promise<{
  ok: boolean;
  runId: string | null;
  status: "claimed" | "already_running" | "not_found" | "not_claimable" | "empty";
  queuedDomains: number;
  remainingDomains: number;
}> {
  const reclaimedRunIds = await requeueStaleRunningDiscoveryRuns();
  if (reclaimedRunIds.length > 0) {
    console.log("[LGS] Re-queued stale running discovery runs", { runIds: reclaimedRunIds });
  }

  const [nextRun] = await db
    .select({ id: discoveryRuns.id })
    .from(discoveryRuns)
    .where(inArray(discoveryRuns.status, ["pending", "stalled"]))
    .orderBy(sql`${discoveryRuns.createdAt} asc`)
    .limit(1);

  if (!nextRun) {
    return {
      ok: true,
      runId: null,
      status: "empty",
      queuedDomains: 0,
      remainingDomains: 0,
    };
  }

  const result = await processDiscoveryRunById(nextRun.id);
  return {
    ...result,
    runId: nextRun.id,
  };
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

  if (uniqueRows.length === 0) {
    throw new Error("No valid domains were queued for discovery");
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
    __queue_cursor: 0,
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
