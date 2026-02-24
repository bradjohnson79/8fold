/**
 * Audit Production Job table vs Drizzle schema.
 * Run: DATABASE_URL="..." pnpm exec tsx scripts/audit-job-table.ts
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
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("=== STEP 1 — Production Job Table ===\n");

  // Check both Job and jobs (0054 may have renamed)
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema()
    AND (table_name = 'Job' OR table_name = 'jobs')
  `);
  console.log("Job/ jobs tables found:", tables.rows.map((r) => r.table_name).join(", ") || "none");

  const tableName = tables.rows[0]?.table_name ?? "Job";
  const res = await client.query(
    `
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = $1
    ORDER BY ordinal_position
  `,
    [tableName]
  );

  const prodCols: { name: string; data_type: string; udt_name: string }[] = res.rows.map(
    (r) => ({ name: r.column_name, data_type: r.data_type, udt_name: r.udt_name })
  );

  for (const c of prodCols) {
    console.log(`  ${c.name}: ${c.data_type} (udt: ${c.udt_name})`);
  }

  await client.end();

  // Output as JSON for diff tool
  console.log("\n--- Production columns (JSON) ---");
  console.log(JSON.stringify(prodCols.map((c) => c.name), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
