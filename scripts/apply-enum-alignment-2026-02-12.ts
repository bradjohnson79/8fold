/**
 * Apply SAFE enum alignment changes (add-only) to Postgres schema 8fold_test.
 *
 * Rules:
 * - ONLY ADD values (no drop/recreate/reorder)
 * - Never casts existing columns
 *
 * Writes: docs/ENUM_ALIGNMENT_APPLIED_2026_02_12.md
 *
 * Run:
 *   pnpm exec tsx scripts/apply-enum-alignment-2026-02-12.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

type Change = {
  enumName: string;
  addValue: string;
  reason: string;
};

const CHANGES: Change[] = [
  {
    enumName: "JobStatus",
    addValue: "COMPLETED",
    reason:
      "Admin calls GET /api/admin/jobs?status=COMPLETED; Postgres enum JobStatus did not accept COMPLETED, causing 500 (22P02 invalid input value for enum).",
  },
];

const ENUM_SQL = `
SELECT t.typname AS typname, e.enumlabel AS enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '8fold_test' AND t.typname = $1
ORDER BY e.enumsortorder;
`.trim();

async function main() {
  const repoRoot = process.cwd();

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const now = new Date().toISOString();
  const evidence: Array<{
    enumName: string;
    before: string[];
    after: string[];
    appliedSql: string;
    reason: string;
  }> = [];

  for (const c of CHANGES) {
    const beforeRows = await pg.query(ENUM_SQL, [c.enumName]).then((r) => r.rows);
    const before = beforeRows.map((r: any) => String(r.enumlabel));

    const appliedSql = `ALTER TYPE "8fold_test"."${c.enumName}" ADD VALUE IF NOT EXISTS '${c.addValue}';`;
    await pg.query(appliedSql);

    const afterRows = await pg.query(ENUM_SQL, [c.enumName]).then((r) => r.rows);
    const after = afterRows.map((r: any) => String(r.enumlabel));

    evidence.push({ enumName: c.enumName, before, after, appliedSql, reason: c.reason });
  }

  await pg.end();

  const outPath = path.join(repoRoot, "docs", "ENUM_ALIGNMENT_APPLIED_2026_02_12.md");
  const lines: string[] = [];
  lines.push("## ENUM ALIGNMENT APPLIED — 2026-02-12");
  lines.push("");
  lines.push(`Timestamp: \`${now}\``);
  lines.push("");
  lines.push("### Changes (add-only)");
  lines.push("");

  for (const e of evidence) {
    lines.push(`### ${e.enumName}`);
    lines.push("");
    lines.push(`Reason: ${e.reason}`);
    lines.push("");
    lines.push("Applied SQL:");
    lines.push("");
    lines.push("```sql");
    lines.push(e.appliedSql);
    lines.push("```");
    lines.push("");
    lines.push("Before:");
    lines.push("");
    lines.push("```");
    lines.push(e.before.join("\n"));
    lines.push("```");
    lines.push("");
    lines.push("After:");
    lines.push("");
    lines.push("```");
    lines.push(e.after.join("\n"));
    lines.push("```");
    lines.push("");
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath, changes: evidence.length }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

