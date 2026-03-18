/**
 * LGS Outreach: Import contractor contacts from CSV or Excel.
 * Validates email format, dedupes by email.
 */
import Papa from "papaparse";
import { db } from "@/db/drizzle";
import { contractorContacts } from "@/db/schema/directoryEngine";
import { eq } from "drizzle-orm";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ImportRow = {
  name?: string;
  job_position?: string;
  trade_category?: string;
  location?: string;
  email: string;
  website?: string;
  notes?: string;
};

function mapRow(row: Record<string, unknown>): ImportRow | null {
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v != null) return String(v).trim();
    }
    return "";
  };

  const email = get(["email", "Email", "EMAIL"]);
  if (!email || !EMAIL_REGEX.test(email)) return null;

  return {
    name: get(["name", "Name", "NAME"]) || undefined,
    job_position: get(["job_position", "job position", "jobposition"]) || undefined,
    trade_category: get(["trade_category", "trade category", "tradecategory", "trade"]) || undefined,
    location: get(["location", "Location", "LOCATION"]) || undefined,
    email,
    website: get(["website", "Website", "WEBSITE"]) || undefined,
    notes: get(["notes", "Notes", "NOTES"]) || undefined,
  };
}

function parseCSV(buffer: Buffer): ImportRow[] {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows: ImportRow[] = [];
  for (const row of parsed.data) {
    const mapped = mapRow(row as Record<string, unknown>);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

async function parseExcel(buffer: Buffer): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const rows: ImportRow[] = [];
  for (const row of data) {
    const mapped = mapRow(row);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

export async function parseImportFile(buffer: Buffer, mimeType: string): Promise<ImportRow[]> {
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

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

export async function importContactsFromFile(buffer: Buffer, mimeType: string): Promise<ImportResult> {
  const rows = await parseImportFile(buffer, mimeType);
  return importContactsInternal(rows);
}

async function importContactsInternal(rows: ImportRow[]): Promise<ImportResult> {
  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const email = row.email.toLowerCase().trim();
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);

    try {
      const existing = await db
        .select({ id: contractorContacts.id })
        .from(contractorContacts)
        .where(eq(contractorContacts.email, email))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(contractorContacts).values({
        name: row.name ?? null,
        jobPosition: row.job_position ?? null,
        tradeCategory: row.trade_category ?? null,
        location: row.location ?? null,
        email: row.email,
        website: row.website ?? null,
        notes: row.notes ?? null,
        status: "pending",
      });
      imported++;
    } catch (err) {
      errors.push(`${row.email}: ${String(err)}`);
    }
  }

  return { imported, skipped, errors };
}
