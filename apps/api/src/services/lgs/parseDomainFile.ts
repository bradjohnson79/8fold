/**
 * Parse CSV/XLSX file to extract normalized website rows plus optional
 * structured lead fields for import and enrichment.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export const MAX_ROWS = 10_000;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export type DomainFileRow = {
  domain: string;
  campaignType?: "contractor" | "jobs";
  category?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  trade?: string;
};

/** Domains that are social media / directory sites — never valid contractor websites */
const BLOCKED_DOMAINS = new Set([
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "yelp.com",
  "google.com",
  "google.co.uk",
  "apple.com",
  "amazon.com",
  "wikipedia.org",
  "reddit.com",
  "nextdoor.com",
  "thumbtack.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "houzz.com",
  "bbb.org",
  "yellowpages.com",
]);

/**
 * Full URL → clean domain.
 * Strips protocol, www, paths, query strings, tracking params, and trailing slashes.
 * Returns null for obviously invalid values.
 */
function normalizeDomain(raw: string): string | null {
  try {
    let cleaned = raw.trim();
    if (!cleaned) return null;

    // Add a protocol so URL() can parse it if missing
    if (!/^https?:\/\//i.test(cleaned)) {
      cleaned = `https://${cleaned}`;
    }

    const url = new URL(cleaned);
    const host = url.hostname
      .replace(/^www\./i, "")
      .toLowerCase()
      .trim();

    // Must contain a dot and be at least 4 chars
    if (!host || !host.includes(".") || host.length < 4) return null;

    // Reject IP addresses
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

    // Reject known social / directory sites
    if (BLOCKED_DOMAINS.has(host)) return null;

    // Also reject subdomains of blocked domains (e.g. facebook.com/page → facebook.com)
    for (const blocked of BLOCKED_DOMAINS) {
      if (host.endsWith(`.${blocked}`)) return null;
    }

    return host;
  } catch {
    return null;
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/[()]/g, "");
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) continue;
    if (typeof value === "string") {
      normalized[normalizedKey] = value.trim();
      continue;
    }
    if (typeof value === "number") {
      normalized[normalizedKey] = String(value).trim();
      continue;
    }
    if (typeof value === "boolean") {
      normalized[normalizedKey] = value ? "true" : "false";
    }
  }
  return normalized;
}

/** Find the website column value from a normalized row */
function getDomainKey(row: Record<string, string>): string | null {
  const WEBSITE_ALIASES = ["website", "domain", "url", "site", "web"];
  for (const alias of WEBSITE_ALIASES) {
    const value = row[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Get an optional string field from a normalized row */
function getOptionalField(row: Record<string, string>, ...aliases: string[]): string | undefined {
  for (const alias of aliases.map(normalizeHeader)) {
    const value = row[alias];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/** Normalize US state: "California" → "CA" (2-letter only if already abbrev) */
function normalizeState(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t.length === 2) return t.toUpperCase();
  return t;
}

/** Normalize country: USA → US, United States → US */
function normalizeCountry(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toUpperCase();
  if (t === "USA" || t === "UNITED STATES" || t === "UNITED STATES OF AMERICA" || t === "U.S.A." || t === "U.S.") {
    return "US";
  }
  if (t === "CANADA" || t === "CAN") return "CA";
  if (t === "UNITED KINGDOM" || t === "UK" || t === "GBR") return "GB";
  if (t === "AUSTRALIA" || t === "AUS") return "AU";
  // If it's 2 letters already, return as uppercase
  if (t.length === 2) return t;
  // Otherwise return the raw value trimmed
  return raw.trim();
}

export type ParseStats = {
  total_rows: number;
  accepted: number;
  skipped_empty: number;
  skipped_invalid: number;
  skipped_invalid_email: number;
  skipped_blocked: number;
  skipped_duplicate: number;
};

export function hasStructuredLeadFields(row: DomainFileRow): boolean {
  return Boolean(
    row.company ||
    row.address ||
    row.firstName ||
    row.lastName ||
    row.title ||
    row.email ||
    row.trade
  );
}

function parseRows(rawRows: Record<string, unknown>[]): { rows: DomainFileRow[]; stats: ParseStats } {
  const results: DomainFileRow[] = [];
  const seen = new Set<string>();

  let skipped_empty = 0;
  let skipped_invalid = 0;
  let skipped_invalid_email = 0;
  let skipped_blocked = 0;
  let skipped_duplicate = 0;

  const limited = rawRows.slice(0, MAX_ROWS);

  for (const rawRow of limited) {
    const row = normalizeRow(rawRow);
    const rawSite = getDomainKey(row);

    if (!rawSite) {
      skipped_empty++;
      continue;
    }

    // Check if it was blocked domain before normalization for cleaner error tracking
    const lowerRaw = rawSite.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
    if (BLOCKED_DOMAINS.has(lowerRaw ?? "")) {
      skipped_blocked++;
      continue;
    }

    const domain = normalizeDomain(rawSite);

    if (!domain) {
      skipped_invalid++;
      continue;
    }

    if (seen.has(domain)) {
      skipped_duplicate++;
      continue;
    }

    seen.add(domain);

    const city = getOptionalField(row, "city");
    const campaignRaw = getOptionalField(row, "campaign", "campaign_type", "pipeline");
    const normalizedCampaign = campaignRaw?.trim().toLowerCase();
    if (normalizedCampaign && normalizedCampaign !== "contractor" && normalizedCampaign !== "jobs") {
      throw new Error(`Invalid campaign type '${campaignRaw}'. Use 'contractor' or 'jobs'.`);
    }
    const campaignType =
      normalizedCampaign === "contractor" || normalizedCampaign === "jobs"
        ? normalizedCampaign
        : undefined;
    const category = getOptionalField(row, "category");
    const stateRaw = getOptionalField(row, "state");
    const state = normalizeState(stateRaw);
    const countryRaw = getOptionalField(row, "country");
    const country = normalizeCountry(countryRaw);
    const company = getOptionalField(row, "company", "business_name", "company_name");
    const address = getOptionalField(row, "address", "street_address", "formatted_address");
    const firstName = getOptionalField(row, "first_name", "firstname", "first");
    const lastName = getOptionalField(row, "last_name", "lastname", "last");
    const title = getOptionalField(row, "title", "job_title", "role");
    const trade = getOptionalField(row, "trade", "trade_category", "industry");
    const rawEmail = getOptionalField(row, "email", "email_address");
    const email = rawEmail ? rawEmail.trim().toLowerCase() : undefined;

    if (email && !EMAIL_REGEX.test(email)) {
      skipped_invalid_email++;
      continue;
    }

    results.push({
      domain,
      campaignType,
      category,
      company,
      address,
      city,
      state,
      country,
      firstName,
      lastName,
      title,
      email,
      trade,
    });
  }

  return {
    rows: results,
    stats: {
      total_rows: limited.length,
      accepted: results.length,
      skipped_empty,
      skipped_invalid,
      skipped_invalid_email,
      skipped_blocked,
      skipped_duplicate,
    },
  };
}

function parseCSV(buffer: Buffer): { rows: DomainFileRow[]; stats: ParseStats } {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return parseRows(parsed.data as Record<string, unknown>[]);
}

function parseExcel(buffer: Buffer): { rows: DomainFileRow[]; stats: ParseStats } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      stats: {
        total_rows: 0,
        accepted: 0,
        skipped_empty: 0,
        skipped_invalid: 0,
        skipped_invalid_email: 0,
        skipped_blocked: 0,
        skipped_duplicate: 0,
      },
    };
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      rows: [],
      stats: {
        total_rows: 0,
        accepted: 0,
        skipped_empty: 0,
        skipped_invalid: 0,
        skipped_invalid_email: 0,
        skipped_blocked: 0,
        skipped_duplicate: 0,
      },
    };
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return parseRows(rows);
}

export function parseDomainFile(
  buffer: Buffer,
  mimeType: string
): { rows: DomainFileRow[]; stats: ParseStats } {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large. Maximum size is 10MB.`);
  }

  const looksLikeCsv =
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "text/plain" ||
    (mimeType === "application/octet-stream" && buffer.slice(0, 512).toString("utf-8").includes(","));

  const looksLikeExcel =
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.oasis.opendocument.spreadsheet";

  if (looksLikeCsv) return parseCSV(buffer);
  if (looksLikeExcel) return parseExcel(buffer);

  // Fallback: sniff by file magic bytes (XLSX starts with PK zip header)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return parseExcel(buffer);

  // Last resort: try CSV
  if (mimeType === "application/octet-stream") return parseCSV(buffer);

  throw new Error(`Unsupported file type: ${mimeType}. Upload a CSV or XLSX file.`);
}
