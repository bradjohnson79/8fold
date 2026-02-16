/**
 * Router rewards migration (idempotent).
 *
 * Creates:
 * - User.referredByRouterId (text nullable)
 * - RouterReward table (uuid pk) with unique(referredUserId)
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-router-rewards.ts
 */
import "dotenv/config";
import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function schemaFromDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const schema = schemaFromDatabaseUrl(DATABASE_URL);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const userT = `"${schema}"."User"`;
  const rewardsT = `"${schema}"."RouterReward"`;

  // 1) Column: User.referredByRouterId
  await client.query(`alter table ${userT} add column if not exists "referredByRouterId" text null`);

  // 2) Table: RouterReward
  await client.query(`
    create table if not exists ${rewardsT} (
      "id" uuid primary key default gen_random_uuid(),
      "routerUserId" text not null,
      "referredUserId" text not null,
      "jobId" text not null,
      "amount" integer not null default 500,
      "status" text not null default 'PENDING',
      "createdAt" timestamp with time zone not null default now(),
      "paidAt" timestamp with time zone null,
      constraint "router_reward_status_check" check ("status" in ('PENDING','PAID'))
    )
  `);

  // 3) Unique constraint (referredUserId) — only one reward per referred user.
  await client.query(
    `create unique index if not exists "router_rewards_referred_user_id_unique" on ${rewardsT} ("referredUserId")`,
  );

  // Helpful index for router dashboards
  await client.query(
    `create index if not exists "router_rewards_router_user_id_idx" on ${rewardsT} ("routerUserId")`,
  );

  console.log("ok", { schema });
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

