import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), "apps/api/.env.local") });

const sql = readFileSync(join(process.cwd(), "drizzle/0146_lgs_sender_warmup.sql"), "utf-8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log("Applying migration 0146: sender warmup columns...");
  await client.query(sql);
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM directory_engine.sender_pool`
  );
  console.log(`Done. sender_pool rows: ${rows[0]?.count ?? 0}`);
  await client.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
