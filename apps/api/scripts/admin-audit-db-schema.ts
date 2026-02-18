/**
 * ADMIN AUDIT — DB schema evidence generator
 *
 * Reads the last run results from `ADMIN_AUDIT_RUN_RESULTS.json` and writes
 * `ADMIN_AUDIT_DB_SCHEMA.md` with introspection evidence for endpoints that returned 500.
 *
 * Run:
 *   pnpm exec tsx apps/api/scripts/admin-audit-db-schema.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

type RunResults = {
  results: Array<{
    name: string;
    method: string;
    url: string;
    traceId: string;
    status: number;
    ok: boolean;
    skipped?: boolean;
  }>;
};

function mdCode(sql: string, rows: unknown) {
  return ["```sql", sql.trim(), "```", "", "```json", JSON.stringify(rows, null, 2), "```"].join("\n");
}

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const resultsPath = path.join(process.cwd(), "ADMIN_AUDIT_RUN_RESULTS.json");
  if (!fs.existsSync(resultsPath)) throw new Error("ADMIN_AUDIT_RUN_RESULTS.json missing (run smoke-admin-audit.ts first)");

  const run = JSON.parse(fs.readFileSync(resultsPath, "utf8")) as RunResults;
  const failures500 = run.results.filter((r) => !r.skipped && r.status === 500);

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const lines: string[] = [];
  lines.push("## ADMIN AUDIT — DB Schema Evidence (for 500s)");
  lines.push("");
  lines.push(`Generated: \`${new Date().toISOString()}\``);
  lines.push("");

  // Hardcoded mapping from endpoint name → tables/enums to introspect.
  const mapping: Record<string, { endpoint: string; tables: string[]; enums?: string[] }> = {
    "jobs.list.COMPLETED": {
      endpoint: "GET /api/admin/jobs?status=COMPLETED",
      tables: ["Job", "JobAssignment", "Contractor"],
      enums: ["JobStatus"],
    },
    "routing-activity": {
      endpoint: "GET /api/admin/routing-activity",
      tables: ["Job", "JobDispatch", "RouterProfile", "User"],
    },
    "support.tickets.backend": {
      endpoint: "GET /api/admin/support/tickets",
      tables: ["support_tickets", "support_messages"],
    },
    "users.all": {
      endpoint: "GET /api/admin/users",
      tables: ["User", "ContractorAccount", "Router", "JobPosterProfile"],
      enums: ["TradeCategory"],
    },
    "users.contractors": {
      endpoint: "GET /api/admin/users/contractors",
      tables: ["ContractorAccount", "User"],
      enums: ["TradeCategory"],
    },
  };

  for (const f of failures500) {
    const m = mapping[f.name];
    lines.push(`### ${f.method} ${f.url}`);
    lines.push("");
    lines.push(`- Trace ID: \`${f.traceId}\``);
    lines.push(`- Smoke runner name: \`${f.name}\``);
    lines.push("");

    if (!m) {
      lines.push("- Tables involved: (no mapping provided)");
      lines.push("");
      continue;
    }

    lines.push(`- Endpoint: \`${m.endpoint}\``);
    lines.push(`- Tables involved: ${m.tables.map((t) => `\`${t}\``).join(", ")}`);
    if (m.enums?.length) lines.push(`- Enums involved: ${m.enums.map((e) => `\`${e}\``).join(", ")}`);
    lines.push("");

    for (const table of m.tables) {
      lines.push(`#### Table: \`${table}\``);
      lines.push("");

      const columnsSql = `
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
      `;
      const columns = await pg.query(columnsSql, [table]).then((r) => r.rows);
      lines.push("**Columns**");
      lines.push("");
      lines.push(mdCode(columnsSql, columns));
      lines.push("");

      const constraintsSql = `
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
      `;
      const constraints = await pg.query(constraintsSql, [table]).then((r) => r.rows);
      lines.push("**Constraints**");
      lines.push("");
      lines.push(mdCode(constraintsSql, constraints));
      lines.push("");

      const indexesSql = `
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
      `;
      const indexes = await pg.query(indexesSql, [table]).then((r) => r.rows);
      lines.push("**Indexes**");
      lines.push("");
      lines.push(mdCode(indexesSql, indexes));
      lines.push("");
    }

    if (m.enums?.length) {
      for (const en of m.enums) {
        lines.push(`#### Enum: \`${en}\``);
        lines.push("");
        const enumSql = `
SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '8fold_test' AND t.typname = $1
ORDER BY e.enumsortorder;
        `;
        const enumRows = await pg.query(enumSql, [en]).then((r) => r.rows);
        lines.push(mdCode(enumSql, enumRows));
        lines.push("");
      }
    }
  }

  await pg.end();

  const outPath = path.join(process.cwd(), "ADMIN_AUDIT_DB_SCHEMA.md");
  fs.writeFileSync(outPath, lines.join("\n"));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath, failures500: failures500.length }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

