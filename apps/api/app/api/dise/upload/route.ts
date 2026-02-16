import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { directories } from "@/db/schema/directoryEngine";

type Scope = "REGIONAL" | "NATIONAL";

type UploadRequest = {
  csvText: string;
  scopeSource: "CSV" | "OVERRIDE";
  override?: {
    scope: Scope;
    region?: string;
    country?: string;
  };
};

type UploadError = { row: number; reason: string };

const EXPECTED_HEADER =
  "name,homepageUrl,submissionUrl,contactEmail,region,country,scope,category,free,requiresApproval,authorityScore";

const CA_PROVINCES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

function normalizeCountry(raw: string): "CA" | "US" | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v === "CA" || v === "CANADA") return "CA";
  if (v === "US" || v === "USA" || v === "UNITED STATES" || v === "UNITEDSTATES") return "US";
  return null;
}

function normalizeScope(raw: string): Scope | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "REGIONAL" || v === "NATIONAL") return v;
  return null;
}

function normalizeCategory(raw: string): string | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return v ? v : null;
}

function parseBooleanStrict(raw: string): boolean | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseAuthorityScore(raw: string): number | null {
  const v = String(raw ?? "").trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 100) return null;
  return n;
}

function normalizeUrl(raw: string): { url: string | null; reason?: string } {
  const v = String(raw ?? "").trim();
  if (!v) return { url: null, reason: "missing_url" };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { url: null, reason: "invalid_url" };
  }

  // Prefer HTTPS when possible (upgrade http -> https).
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:" && u.protocol !== "http:") return { url: null, reason: "invalid_url_protocol" };

  // Remove query + hash.
  u.search = "";
  u.hash = "";

  // Strip trailing slash (but preserve path).
  if (u.pathname.endsWith("/") && u.pathname !== "/") {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  // Normalize hostname case.
  u.hostname = u.hostname.toLowerCase();

  return { url: u.toString().replace(/\/$/, "") };
}

function getRootDomainFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    const h = host.startsWith("www.") ? host.slice(4) : host;
    return rootDomainFromHost(h);
  } catch {
    return null;
  }
}

const THREE_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "co.jp",
  "co.kr",
  "co.za",
  "com.sg",
  "com.my",
  "com.tr",
  "com.tw",
  "com.cn",
  "com.hk",
  "com.ar",
  "com.pl",
  "co.in",
  "com.in",
]);

function rootDomainFromHost(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (THREE_PART_SUFFIXES.has(last2)) {
    return parts.slice(-3).join(".");
  }
  return last2;
}

function inferCountryFromRegion(region: string): "CA" | "US" | null {
  const r = String(region ?? "").trim().toUpperCase();
  if (!r) return null;
  if (CA_PROVINCES.has(r)) return "CA";
  if (US_STATES.has(r)) return "US";
  return null;
}

function parseCsv(text: string): { header: string; rows: string[][] } {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const header = lines[0] ?? "";
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export async function POST(req: Request) {
  const errors: UploadError[] = [];
  try {
    const body = (await req.json().catch(() => null)) as UploadRequest | null;
    if (!body || typeof body.csvText !== "string") {
      return NextResponse.json({ ok: false, error: "csvText_required" }, { status: 400 });
    }

    const { header, rows } = parseCsv(body.csvText);
    if (header.trim() !== EXPECTED_HEADER) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_header",
          expectedHeader: EXPECTED_HEADER,
          gotHeader: header.trim(),
        },
        { status: 400 },
      );
    }

    const scopeSource = body.scopeSource;
    if (scopeSource !== "CSV" && scopeSource !== "OVERRIDE") {
      return NextResponse.json({ ok: false, error: "invalid_scope_source" }, { status: 400 });
    }

    const overrideScope = scopeSource === "OVERRIDE" ? body.override?.scope : undefined;
    if (scopeSource === "OVERRIDE" && (!overrideScope || !["REGIONAL", "NATIONAL"].includes(overrideScope))) {
      return NextResponse.json({ ok: false, error: "override_scope_required" }, { status: 400 });
    }

    // Build existing dedupe sets (DB).
    const existing = await db
      .select({
        homepageUrl: directories.homepageUrl,
        submissionUrl: directories.submissionUrl,
      })
      .from(directories);

    const existingHomepage = new Set<string>();
    const existingSubmission = new Set<string>();
    const existingDomains = new Set<string>();
    for (const e of existing) {
      if (e.homepageUrl) {
        existingHomepage.add(String(e.homepageUrl));
        const d = getRootDomainFromUrl(String(e.homepageUrl));
        if (d) existingDomains.add(d);
      }
      if (e.submissionUrl) existingSubmission.add(String(e.submissionUrl));
    }

    // Batch dedupe sets.
    const batchDomains = new Set<string>();
    const batchHomepage = new Set<string>();
    const batchSubmission = new Set<string>();

    let inserted = 0;
    let skippedDuplicates = 0;
    let rejected = 0;

    const toInsert: Array<{
      name: string;
      homepageUrl: string;
      submissionUrl: string;
      contactEmail: string | null;
      region: string | null;
      country: string;
      scope: Scope;
      category: string;
      free: boolean;
      requiresApproval: boolean;
      authorityScore: number;
      status: "NEW";
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    const now = new Date();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header is row 1
      const cols = rows[i] ?? [];
      if (cols.length !== 11) {
        rejected++;
        errors.push({ row: rowNum, reason: `wrong_column_count_expected_11_got_${cols.length}` });
        continue;
      }

      const [
        nameRaw,
        homepageUrlRaw,
        submissionUrlRaw,
        contactEmailRaw,
        regionRaw,
        countryRaw,
        scopeRaw,
        categoryRaw,
        freeRaw,
        requiresApprovalRaw,
        authorityScoreRaw,
      ] = cols;

      const name = String(nameRaw ?? "").trim();
      if (!name) {
        rejected++;
        errors.push({ row: rowNum, reason: "missing_name" });
        continue;
      }

      const homepageNorm = normalizeUrl(String(homepageUrlRaw ?? ""));
      if (!homepageNorm.url) {
        rejected++;
        errors.push({ row: rowNum, reason: `homepageUrl_${homepageNorm.reason ?? "invalid"}` });
        continue;
      }

      const submissionNorm = normalizeUrl(String(submissionUrlRaw ?? ""));
      if (!submissionNorm.url) {
        rejected++;
        errors.push({ row: rowNum, reason: `submissionUrl_${submissionNorm.reason ?? "invalid"}` });
        continue;
      }

      const rootDomain = getRootDomainFromUrl(homepageNorm.url);
      if (!rootDomain) {
        rejected++;
        errors.push({ row: rowNum, reason: "invalid_homepage_root_domain" });
        continue;
      }

      const free = parseBooleanStrict(String(freeRaw ?? ""));
      if (free == null) {
        rejected++;
        errors.push({ row: rowNum, reason: "free_must_be_true_or_false" });
        continue;
      }

      const requiresApproval = parseBooleanStrict(String(requiresApprovalRaw ?? ""));
      if (requiresApproval == null) {
        rejected++;
        errors.push({ row: rowNum, reason: "requiresApproval_must_be_true_or_false" });
        continue;
      }

      const authorityScore = parseAuthorityScore(String(authorityScoreRaw ?? ""));
      if (authorityScore == null) {
        rejected++;
        errors.push({ row: rowNum, reason: "authorityScore_must_be_integer_1_100" });
        continue;
      }

      const category = normalizeCategory(String(categoryRaw ?? ""));
      if (!category) {
        rejected++;
        errors.push({ row: rowNum, reason: "missing_category" });
        continue;
      }

      // Scope / region / country: either from CSV or override mode.
      const scope = scopeSource === "OVERRIDE" ? (overrideScope as Scope) : normalizeScope(String(scopeRaw ?? ""));
      if (!scope) {
        rejected++;
        errors.push({ row: rowNum, reason: "invalid_scope" });
        continue;
      }

      let region: string | null =
        scopeSource === "OVERRIDE"
          ? scope === "REGIONAL"
            ? String(body.override?.region ?? "").trim()
            : ""
          : String(regionRaw ?? "").trim();
      if (region) region = region.toUpperCase();

      let country: "CA" | "US" | null =
        scopeSource === "OVERRIDE"
          ? scope === "NATIONAL"
            ? normalizeCountry(String(body.override?.country ?? ""))
            : inferCountryFromRegion(region ?? "")
          : normalizeCountry(String(countryRaw ?? ""));

      // Validate scope-specific constraints.
      if (scope === "REGIONAL") {
        if (!region) {
          rejected++;
          errors.push({ row: rowNum, reason: "region_required_for_regional" });
          continue;
        }
        const inferred = inferCountryFromRegion(region);
        if (!inferred) {
          rejected++;
          errors.push({ row: rowNum, reason: "unknown_region_for_country_validation" });
          continue;
        }
        if (!country) country = inferred;
        if (country !== inferred) {
          rejected++;
          errors.push({ row: rowNum, reason: `country_region_mismatch_expected_${inferred}_got_${country}` });
          continue;
        }
      } else {
        // NATIONAL
        if (region) {
          rejected++;
          errors.push({ row: rowNum, reason: "region_must_be_empty_for_national" });
          continue;
        }
        if (!country || (country !== "CA" && country !== "US")) {
          rejected++;
          errors.push({ row: rowNum, reason: "country_must_be_canada_or_usa_for_national" });
          continue;
        }
      }

      const homepageUrl = homepageNorm.url;
      const submissionUrl = submissionNorm.url;

      // Dedup: batch first, then DB.
      const dupBatch =
        batchDomains.has(rootDomain) ||
        batchHomepage.has(homepageUrl) ||
        batchSubmission.has(submissionUrl);
      if (dupBatch) {
        skippedDuplicates++;
        errors.push({ row: rowNum, reason: "duplicate_within_csv_batch" });
        continue;
      }
      batchDomains.add(rootDomain);
      batchHomepage.add(homepageUrl);
      batchSubmission.add(submissionUrl);

      const dupDb =
        existingDomains.has(rootDomain) ||
        existingHomepage.has(homepageUrl) ||
        existingSubmission.has(submissionUrl);
      if (dupDb) {
        skippedDuplicates++;
        errors.push({ row: rowNum, reason: "duplicate_against_existing_db" });
        continue;
      }

      // contactEmail optional
      const contactEmail = String(contactEmailRaw ?? "").trim() || null;

      toInsert.push({
        name,
        homepageUrl,
        submissionUrl,
        contactEmail,
        region: scope === "REGIONAL" ? (region || null) : null,
        country,
        scope,
        category,
        free,
        requiresApproval,
        authorityScore,
        status: "NEW",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (toInsert.length) {
      const res = await db.insert(directories).values(toInsert).returning({ id: directories.id });
      inserted = res.length;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skippedDuplicates,
      rejected,
      errors,
    });
  } catch (err) {
    console.error("DISE upload error:", err);
    errors.push({ row: 0, reason: "internal_error" });
    return NextResponse.json(
      {
        ok: false,
        inserted: 0,
        skippedDuplicates: 0,
        rejected: 0,
        errors,
      },
      { status: 500 },
    );
  }
}

