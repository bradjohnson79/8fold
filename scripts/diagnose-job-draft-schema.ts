/**
 * Diagnose JobDraft 500 Error — Schema/Enum Inspection
 * Run: DATABASE_URL="..." pnpm exec tsx scripts/diagnose-job-draft-schema.ts
 * DO NOT MODIFY — inspection only.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "apps/api", ".env.local") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("=== JobDraft 500 Diagnostic — Inspection Only ===\n");

  try {
    // Step 1 — JobDraft table structure (equivalent to \d "JobDraft")
    const tableRes = await client.query(`
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.column_default,
        c.is_nullable,
        c.character_maximum_length
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE t.table_name = 'JobDraft'
      ORDER BY c.ordinal_position
    `);

    console.log("--- Step 1: JobDraft table structure ---");
    if (tableRes.rows.length === 0) {
      console.log("TABLE NOT FOUND: JobDraft does not exist.\n");
    } else {
      console.log("Columns:");
      for (const r of tableRes.rows) {
        console.log(`  ${r.column_name}: ${r.data_type} (udt: ${r.udt_name}) nullable=${r.is_nullable} default=${r.column_default ?? "NULL"}`);
      }
      console.log("");
    }

    // Step 2 — JobDraftStatus enum
    const enumRes = await client.query(`
      SELECT e.enumlabel, t.typname, n.nspname
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE t.typname = 'JobDraftStatus'
      ORDER BY e.enumsortorder
    `);

    console.log("--- Step 2: JobDraftStatus enum ---");
    if (enumRes.rows.length === 0) {
      console.log("ENUM NOT FOUND: JobDraftStatus does not exist.\n");
    } else {
      console.log("Schema:", enumRes.rows[0]?.nspname ?? "?");
      console.log("Values (case-sensitive):");
      for (const r of enumRes.rows) {
        console.log(`  "${r.enumlabel}"`);
      }
      const hasActive = enumRes.rows.some((r) => r.enumlabel === "ACTIVE");
      console.log(`\nACTIVE exists exactly: ${hasActive ? "YES" : "NO"}`);
      console.log("");
    }

    // List all enum types (if JobDraftStatus not found, maybe different name)
    const allEnumsRes = await client.query(`
      SELECT DISTINCT t.typname, n.nspname
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE t.typtype = 'e'
      AND (t.typname ILIKE '%jobdraft%' OR t.typname ILIKE '%draft%')
      ORDER BY t.typname
    `);

    console.log("--- Related enum types (jobdraft/draft) ---");
    if (allEnumsRes.rows.length === 0) {
      console.log("None found.\n");
    } else {
      for (const r of allEnumsRes.rows) {
        console.log(`  ${r.nspname}."${r.typname}"`);
      }
      console.log("");
    }

    // Step 3 — Status column type on JobDraft
    const statusCol = tableRes.rows.find((r) => r.column_name === "status");
    if (statusCol) {
      console.log("--- Step 3: status column type ---");
      console.log(`  data_type: ${statusCol.data_type}`);
      console.log(`  udt_name: ${statusCol.udt_name}`);
      console.log(`  (Drizzle expects "JobDraftStatus" enum with value ACTIVE)\n`);
    }

    // Check which schema JobDraft is in
    const schemaRes = await client.query(`
      SELECT table_schema FROM information_schema.tables WHERE table_name = 'JobDraft'
    `);
    if (schemaRes.rows.length > 0) {
      console.log("--- JobDraft table schema ---");
      console.log(`  table_schema: ${schemaRes.rows.map((r) => r.table_schema).join(", ")}\n`);
    }

    // Current search_path / schema from URL
    const schemaParam = (() => {
      try {
        const u = new URL(url);
        return u.searchParams.get("schema") ?? "(none)";
      } catch {
        return "(none)";
      }
    })();
    console.log("--- DATABASE_URL schema param ---");
    console.log(`  ?schema= ${schemaParam}\n`);
  } finally {
    await client.end();
  }

  console.log("=== End diagnostic (no changes made) ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
