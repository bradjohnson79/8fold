import path from "node:path";
import fs from "node:fs";

type DbCol = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

function mdEscape(s: string): string {
  return String(s).replaceAll("|", "\\|");
}

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env.local") });
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing (apps/api/.env.local)");

  const pg = await import("pg");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const { getTableColumns } = await import("drizzle-orm/utils");
  const schema = await import("../db/schema/index");

  const tableSpecs: Array<{
    title: string;
    dbSchema: string;
    dbTable: string;
    drizzleTable: any;
  }> = [
    { title: "User", dbSchema: "8fold_test", dbTable: "User", drizzleTable: schema.users },
    { title: "Job", dbSchema: "8fold_test", dbTable: "Job", drizzleTable: schema.jobs },
    { title: "JobPosterProfile", dbSchema: "8fold_test", dbTable: "JobPosterProfile", drizzleTable: schema.jobPosterProfiles },
    { title: "RouterProfile", dbSchema: "8fold_test", dbTable: "RouterProfile", drizzleTable: schema.routerProfiles },
    { title: "routers", dbSchema: "8fold_test", dbTable: "routers", drizzleTable: schema.routers },
    { title: "contractor_accounts", dbSchema: "8fold_test", dbTable: "contractor_accounts", drizzleTable: schema.contractorAccounts },
    { title: "Contractor", dbSchema: "8fold_test", dbTable: "Contractor", drizzleTable: schema.contractors },
    { title: "JobDispatch", dbSchema: "8fold_test", dbTable: "JobDispatch", drizzleTable: schema.jobDispatches },
    { title: "JobPayment", dbSchema: "8fold_test", dbTable: "JobPayment", drizzleTable: schema.jobPayments },
    { title: "conversations", dbSchema: "8fold_test", dbTable: "conversations", drizzleTable: schema.conversations },
    { title: "messages", dbSchema: "8fold_test", dbTable: "messages", drizzleTable: schema.messages },
    { title: "support_tickets", dbSchema: "8fold_test", dbTable: "support_tickets", drizzleTable: schema.supportTickets },
    { title: "support_messages", dbSchema: "8fold_test", dbTable: "support_messages", drizzleTable: schema.supportMessages },
    { title: "support_attachments", dbSchema: "8fold_test", dbTable: "support_attachments", drizzleTable: schema.supportAttachments },
    { title: "notification_deliveries", dbSchema: "8fold_test", dbTable: "notification_deliveries", drizzleTable: schema.notificationDeliveries },
  ];

  async function getDbCols(dbSchema: string, dbTable: string): Promise<DbCol[]> {
    const res = await client.query(
      `select column_name, data_type, udt_name, is_nullable, column_default
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [dbSchema, dbTable],
    );
    return res.rows as DbCol[];
  }

  const lines: string[] = [];
  lines.push("## Live DB ↔ Drizzle Schema Diff (critical tables)");
  lines.push("");
  lines.push(`- Generated: \`${new Date().toISOString()}\``);
  lines.push("");
  lines.push("This is a **best-effort structural diff** (columns, basic nullability/default/type signals).");
  lines.push("");

  for (const t of tableSpecs) {
    const dbCols = await getDbCols(t.dbSchema, t.dbTable);
    const drizzleColsObj = getTableColumns(t.drizzleTable) as Record<string, any>;
    const drizzleColNames = Object.keys(drizzleColsObj);
    const dbColNames = dbCols.map((c) => c.column_name);

    const dbMissingInDrizzle = dbColNames.filter((c) => !drizzleColNames.includes(c));
    const drizzleMissingInDb = drizzleColNames.filter((c) => !dbColNames.includes(c));

    const typeMismatches: string[] = [];
    for (const c of dbCols) {
      const dc = drizzleColsObj[c.column_name];
      if (!dc) continue;
      // Very light heuristic: flag enums where Drizzle column is plain text.
      const dbIsEnum = c.data_type === "USER-DEFINED";
      const drizzleDataType = String((dc as any)?.dataType ?? "");
      if (dbIsEnum && drizzleDataType === "string") {
        typeMismatches.push(`${c.column_name}: DB enum (${c.udt_name}) vs Drizzle string`);
      }
    }

    lines.push(`### ${t.title} (\`${t.dbSchema}.${t.dbTable}\`)`);
    lines.push("");
    lines.push(`- Drizzle columns: **${drizzleColNames.length}**`);
    lines.push(`- DB columns: **${dbColNames.length}**`);
    lines.push("");

    if (dbMissingInDrizzle.length === 0 && drizzleMissingInDb.length === 0 && typeMismatches.length === 0) {
      lines.push("- ✅ No column-level diffs detected by this script.");
      lines.push("");
      continue;
    }

    if (dbMissingInDrizzle.length) {
      lines.push("- **DB columns missing in Drizzle**");
      for (const c of dbMissingInDrizzle) lines.push(`  - \`${c}\``);
      lines.push("");
    }
    if (drizzleMissingInDb.length) {
      lines.push("- **Drizzle columns missing in DB**");
      for (const c of drizzleMissingInDb) lines.push(`  - \`${c}\``);
      lines.push("");
    }
    if (typeMismatches.length) {
      lines.push("- **Type warnings**");
      for (const m of typeMismatches) lines.push(`  - ${mdEscape(m)}`);
      lines.push("");
    }

    lines.push("- **DB column details (subset)**");
    lines.push("");
    lines.push("| column | data_type | udt | nullable | default |");
    lines.push("|---|---|---|---|---|");
    for (const c of dbCols.slice(0, 40)) {
      lines.push(
        `| \`${mdEscape(c.column_name)}\` | ${mdEscape(c.data_type)} | \`${mdEscape(c.udt_name)}\` | ${c.is_nullable} | ${c.column_default ? `\`${mdEscape(c.column_default)}\`` : ""} |`,
      );
    }
    if (dbCols.length > 40) lines.push(`| … | … | … | … | … |`);
    lines.push("");
  }

  await client.end();

  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const outPath = path.join(repoRoot, "SCHEMA_DIFF_REPORT.md");
  fs.writeFileSync(outPath, lines.join("\n"));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

