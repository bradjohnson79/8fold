import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

function yyyyMmDd(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}_${mm}_${dd}`;
}

function schemaFromDatabaseUrl(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const schema = schemaFromDatabaseUrl(databaseUrl);
  const now = new Date();
  const stamp = yyyyMmDd(now);

  const c = new Client({ connectionString: databaseUrl });
  await c.connect();

  const tables = ["Escrow", "PartsMaterialRequest", "LedgerEntry"] as const;
  const enums = [
    "EscrowKind",
    "EscrowStatus",
    "PartsMaterialStatus",
    "LedgerEntryType",
    "LedgerDirection",
  ] as const;

  const lines: string[] = [];
  lines.push(`## FINANCIAL DB INTROSPECT (${stamp})`);
  lines.push("");
  lines.push(`- **schema**: \`${schema}\``);
  lines.push(`- **generatedAt**: \`${now.toISOString()}\``);
  lines.push("");

  for (const t of tables) {
    lines.push(`### Table: \`${schema}.${t}\``);
    lines.push("");

    const cols = await c.query(
      `
      select column_name, data_type, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position
      `,
      [schema, t],
    );

    lines.push("#### Columns");
    lines.push("");
    lines.push("| column | data_type | udt_name | nullable | default |");
    lines.push("|---|---|---|---|---|");
    for (const r of cols.rows as any[]) {
      const def = r.column_default ?? "";
      lines.push(`| ${r.column_name} | ${r.data_type} | ${r.udt_name} | ${r.is_nullable} | ${String(def).replaceAll("|", "\\|")} |`);
    }
    lines.push("");

    const cons = await c.query(
      `
      select conname, contype, pg_get_constraintdef(oid) as def
      from pg_constraint
      where connamespace = $1::regnamespace
        and conrelid = $2::regclass
      order by contype, conname
      `,
      [schema, `"${schema}"."${t}"`],
    );
    lines.push("#### Constraints (PK/FK/UNIQUE/CHECK)");
    lines.push("");
    if (cons.rowCount === 0) {
      lines.push("_none found_");
      lines.push("");
    } else {
      lines.push("| name | type | definition |");
      lines.push("|---|---|---|");
      for (const r of cons.rows as any[]) {
        lines.push(`| ${r.conname} | ${r.contype} | ${String(r.def).replaceAll("|", "\\|")} |`);
      }
      lines.push("");
    }

    const idx = await c.query(
      `
      select indexname, indexdef
      from pg_indexes
      where schemaname = $1 and tablename = $2
      order by indexname
      `,
      [schema, t],
    );
    lines.push("#### Indexes");
    lines.push("");
    if (idx.rowCount === 0) {
      lines.push("_none found_");
      lines.push("");
    } else {
      for (const r of idx.rows as any[]) {
        lines.push(`- \`${r.indexname}\``);
        lines.push(`  - \`${String(r.indexdef).replaceAll("`", "\\`")}\``);
      }
      lines.push("");
    }
  }

  lines.push("### Enums");
  lines.push("");
  for (const e of enums) {
    const r = await c.query(
      `
      select e2.enumlabel
      from pg_type t
      join pg_enum e2 on e2.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = $1 and t.typname = $2
      order by e2.enumsortorder
      `,
      [schema, e],
    );
    lines.push(`- **${e}**: ${r.rows.map((x: any) => `\`${x.enumlabel}\``).join(", ")}`);
  }
  lines.push("");

  await c.end();

  // apps/api/scripts -> repo root
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const outPath = path.resolve(repoRoot, `docs/FINANCIAL_DB_INTROSPECT_${stamp}.md`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join("\n"), "utf8");

  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

