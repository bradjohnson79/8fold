import path from "node:path";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local"),
});

async function main() {
  const { db } = await import("../db/drizzle");

  await db.execute(sql`
    create table if not exists "directory_engine"."warmup_system_state" (
      "id" serial primary key,
      "system_name" text not null unique default 'default',
      "last_worker_run_at" timestamp,
      "last_successful_send_at" timestamp,
      "worker_status" text not null default 'stale',
      "last_error" text,
      "metadata" jsonb,
      "created_at" timestamp not null default now(),
      "updated_at" timestamp not null default now()
    );
  `);

  await db.execute(sql`
    alter table "directory_engine"."sender_pool"
      add column if not exists "warmup_interval_anchor_at" timestamp,
      add column if not exists "warmup_sending_at" timestamp;
  `);

  await db.execute(sql`
    alter table "directory_engine"."lgs_warmup_activity"
      add column if not exists "status_reason" text,
      add column if not exists "attempt_number" integer,
      add column if not exists "metadata" jsonb;
  `);

  await db.execute(sql`
    insert into "directory_engine"."warmup_system_state" ("system_name", "worker_status")
    values ('default', 'stale')
    on conflict ("system_name") do nothing;
  `);

  console.log("[LGS Warmup] worker state migration ensured");
}

main().catch((error) => {
  console.error("[LGS Warmup] worker state migration failed:", error);
  process.exit(1);
});
