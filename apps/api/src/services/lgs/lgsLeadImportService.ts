/**
 * LGS: Import contractor leads from CSV or Excel.
 * Email normalization: trim + lowercase. Dedupes by lower(email).
 */
import Papa from "papaparse";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { sql } from "drizzle-orm";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeadImportRow = {
  lead_name?: string;
  business_name?: string;
  email: string;
  website?: string;
  phone?: string;
  trade?: string;
  city?: string;
  state?: string;
  source?: string;
};

function get(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v != null) return String(v).trim();
  }
  return "";
}

function mapRow(row: Record<string, unknown>): LeadImportRow | null {
  const email = get(row, ["email", "Email", "EMAIL"]);
  if (!email || !EMAIL_REGEX.test(email)) return null;

  return {
    lead_name: get(row, ["lead_name", "name", "Name", "lead name"]) || undefined,
    business_name: get(row, ["business_name", "business name", "business", "Business"]) || undefined,
    email,
    website: get(row, ["website", "Website", "WEBSITE"]) || undefined,
    phone: get(row, ["phone", "Phone", "PHONE"]) || undefined,
    trade: get(row, ["trade", "Trade", "trade_category", "trade category"]) || undefined,
    city: get(row, ["city", "City", "CITY"]) || undefined,
    state: get(row, ["state", "State", "STATE"]) || undefined,
    source: get(row, ["source", "Source", "SOURCE"]) || undefined,
  };
}

function parseCSV(buffer: Buffer): LeadImportRow[] {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows: LeadImportRow[] = [];
  for (const row of parsed.data) {
    const mapped = mapRow(row as Record<string, unknown>);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

async function parseExcel(buffer: Buffer): Promise<LeadImportRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const rows: LeadImportRow[] = [];
  for (const row of data) {
    const mapped = mapRow(row);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

export async function parseLeadImportFile(buffer: Buffer, mimeType: string): Promise<LeadImportRow[]> {
  if (
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    (mimeType === "application/octet-stream" && buffer.toString("utf-8", 0, 100).includes(","))
  ) {
    return parseCSV(buffer);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/octet-stream"
  ) {
    return parseExcel(buffer);
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

export type LeadImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

export async function importLeadsFromFile(buffer: Buffer, mimeType: string): Promise<LeadImportResult> {
  const rows = await parseLeadImportFile(buffer, mimeType);
  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const normalizedEmail = row.email.trim().toLowerCase();
    if (seen.has(normalizedEmail)) {
      skipped++;
      continue;
    }
    seen.add(normalizedEmail);

    try {
      const existing = await db
        .select({ id: contractorLeads.id })
        .from(contractorLeads)
        .where(sql`lower(${contractorLeads.email}) = ${normalizedEmail}`)
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(contractorLeads).values({
        leadName: row.lead_name ?? null,
        businessName: row.business_name ?? null,
        email: normalizedEmail,
        website: row.website ?? null,
        phone: row.phone ?? null,
        trade: row.trade ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        source: row.source ?? null,
        status: "active",
      });
      imported++;
    } catch (err) {
      errors.push(`${row.email}: ${String(err)}`);
    }
  }

  return { imported, skipped, errors };
}
