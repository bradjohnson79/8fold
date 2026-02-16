import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

type Row = { id: string };

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function listSqlFiles(dirAbs: string) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const databaseUrl = assertEnv("DATABASE_URL");
  const repoRoot = path.resolve(__dirname, "..");
  const drizzleDir = path.join(repoRoot, "drizzle");

  if (!fs.existsSync(drizzleDir)) {
    throw new Error(`drizzle dir not found: ${drizzleDir}`);
  }

  const files = listSqlFiles(drizzleDir);
  if (files.length === 0) {
    console.log("No drizzle SQL migrations found.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  await client.query(`
    create table if not exists drizzle_sql_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const file of files) {
    const id = file;
    const already = await client.query<Row>(`select id from drizzle_sql_migrations where id = $1 limit 1`, [id]);
    if (already.rows.length) {
      continue;
    }

    const sql = fs.readFileSync(path.join(drizzleDir, file), "utf8");
    if (!sql.trim()) {
      await client.query(`insert into drizzle_sql_migrations(id) values($1)`, [id]);
      continue;
    }

    console.log(`Applying drizzle SQL migration: ${file}`);
    const managesOwnTx = /\b(begin|commit|rollback)\b/i.test(sql);
    if (managesOwnTx) {
      // Some migrations must commit mid-file (e.g. enum value additions).
      // In that case, avoid wrapping in an outer transaction.
      await client.query(sql);
      await client.query(`insert into drizzle_sql_migrations(id) values($1)`, [id]);
    } else {
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(`insert into drizzle_sql_migrations(id) values($1)`, [id]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
  }

  await client.end();
  console.log("Drizzle SQL migrations applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

