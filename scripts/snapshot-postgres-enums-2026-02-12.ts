/**
 * Snapshot canonical Postgres enum labels (8fold_test schema).
 *
 * Writes: docs/POSTGRES_ENUM_SNAPSHOT_2026_02_12.md
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const SQL = `
SELECT typname, enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
JOIN pg_namespace n ON n.oid = pg_type.typnamespace
WHERE n.nspname = '8fold_test'
ORDER BY typname, enumsortorder;
`.trim();

async function main() {
  const repoRoot = process.cwd();
  const timestamp = new Date().toISOString();

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing in environment");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  const rows = (await pg.query(SQL)).rows as Array<{ typname: string; enumlabel: string }>;
  await pg.end();

  const outPath = path.join(repoRoot, "docs", "POSTGRES_ENUM_SNAPSHOT_2026_02_12.md");
  const lines: string[] = [];
  lines.push("## POSTGRES ENUM SNAPSHOT (8fold_test) — 2026-02-12");
  lines.push("");
  lines.push(`Timestamp: \`${timestamp}\``);
  lines.push("");
  lines.push("### Query");
  lines.push("");
  lines.push("```sql");
  lines.push(SQL);
  lines.push("```");
  lines.push("");
  lines.push("### Output (ordered)");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(rows, null, 2));
  lines.push("```");
  lines.push("");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath, rowCount: rows.length }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

