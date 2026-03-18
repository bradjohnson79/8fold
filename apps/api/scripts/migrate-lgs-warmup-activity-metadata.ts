import path from "node:path";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local"),
});

async function main() {
  const { db } = await import("../db/drizzle");
  await db.execute(sql`
    alter table "directory_engine"."lgs_warmup_activity"
      add column if not exists "provider" text,
      add column if not exists "provider_message_id" text,
      add column if not exists "latency_ms" integer;
  `);

  console.log("[LGS Warmup] activity metadata columns ensured");
}

main().catch((error) => {
  console.error("[LGS Warmup] activity metadata migration failed:", error);
  process.exit(1);
});
