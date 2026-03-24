/**
 * Parse CSV/XLSX file to extract domain + optional city/state/country columns.
 *
 * Required column (case-insensitive): website | domain | url
 * Optional columns (case-insensitive): city | state | country
 *
 * Domain normalization:
 *   https://abc.com/path?utm=123 → abc.com
 *
 * Rejects: empty websites, invalid domains, social media platforms
 * Limits: max 10,000 rows, max 10MB
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export const MAX_ROWS = 10_000;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export type DomainFileRow = {
  domain: string;
  email?: string;
  company?: string;
  address?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  trade?: string;
  category?: string;
  campaignType?: "contractor" | "jobs";
  city?: string;
  state?: string;
  country?: string;
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

/** Find the website column value from a row, case-insensitively */
function getDomainKey(row: Record<string, unknown>): string | null {
  const WEBSITE_ALIASES = ["website", "domain", "url", "site", "web"];

  // Try exact match first, then case-insensitive
  for (const key of Object.keys(row)) {
    const lower = key.trim().toLowerCase();
    if (WEBSITE_ALIASES.includes(lower)) {
      const v = row[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v).trim();
    }
  }
  return null;
}

/** Get an optional string field, case-insensitively across several key aliases */
function getOptionalField(row: Record<string, unknown>, ...aliases: string[]): string | undefined {
  for (const key of Object.keys(row)) {
    const lower = key.trim().toLowerCase();
    if (aliases.includes(lower)) {
      const v = row[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v).trim();
    }
  }
  return undefined;
}

function normalizeCampaignType(value: string | undefined): DomainFileRow["campaignType"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "jobs" || normalized === "job_poster" || normalized === "job-posters") {
    return "jobs";
  }
  if (normalized === "contractor" || normalized === "contractors") {
    return "contractor";
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
  skipped_blocked: number;
  skipped_duplicate: number;
};

function parseRows(rawRows: Record<string, unknown>[]): { rows: DomainFileRow[]; stats: ParseStats } {
  const results: DomainFileRow[] = [];
  const seen = new Set<string>();

  let skipped_empty = 0;
  let skipped_invalid = 0;
  let skipped_blocked = 0;
  let skipped_duplicate = 0;

  const limited = rawRows.slice(0, MAX_ROWS);

  for (const row of limited) {
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
    const stateRaw = getOptionalField(row, "state");
    const state = normalizeState(stateRaw);
    const countryRaw = getOptionalField(row, "country");
    const country = normalizeCountry(countryRaw);
    const email = getOptionalField(row, "email", "contact_email");
    const company = getOptionalField(row, "company", "company_name", "business_name", "name");
    const address = getOptionalField(row, "address", "street", "street_address");
    const firstName = getOptionalField(row, "first_name", "firstname", "given_name");
    const lastName = getOptionalField(row, "last_name", "lastname", "surname", "family_name");
    const title = getOptionalField(row, "title", "job_title", "position");
    const trade = getOptionalField(row, "trade", "service", "specialty");
    const category = getOptionalField(row, "category");
    const campaignType = normalizeCampaignType(getOptionalField(row, "campaign_type", "campaign", "lead_type"));

    results.push({
      domain,
      email,
      company,
      address,
      firstName,
      lastName,
      title,
      trade,
      category,
      campaignType,
      city,
      state,
      country,
    });
  }

  return {
    rows: results,
    stats: {
      total_rows: limited.length,
      accepted: results.length,
      skipped_empty,
      skipped_invalid,
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
  if (!sheetName) return { rows: [], stats: { total_rows: 0, accepted: 0, skipped_empty: 0, skipped_invalid: 0, skipped_blocked: 0, skipped_duplicate: 0 } };
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], stats: { total_rows: 0, accepted: 0, skipped_empty: 0, skipped_invalid: 0, skipped_blocked: 0, skipped_duplicate: 0 } };
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
