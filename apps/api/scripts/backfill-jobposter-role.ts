/**
 * Backfill legacy job poster roles (USER/CUSTOMER) → JOB_POSTER.
 *
 * Safety:
 * - Excludes system identities (`authUserId` starts with "system:")
 * - Prints counts before/after
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/backfill-jobposter-role.ts
 */
import path from "node:path";

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing (apps/api/.env.local)");

  const { Client } = await import("pg");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const schema = (() => {
    try {
      const u = new URL(DATABASE_URL);
      return (u.searchParams.get("schema") ?? "public").trim() || "public";
    } catch {
      return "public";
    }
  })();

  const usersT = `"${schema}"."User"`;

  const before = await client.query(
    `select role, count(*)::int as n
     from ${usersT}
     where role in ('USER','CUSTOMER')
       and coalesce("authUserId",'') not like 'system:%'
     group by role
     order by role`,
  );
  console.log("before:", before.rows);

  const updated = await client.query(
    `update ${usersT}
     set role = 'JOB_POSTER', "updatedAt" = now()
     where role in ('USER','CUSTOMER')
       and coalesce("authUserId",'') not like 'system:%'`,
  );
  console.log("updated rows:", updated.rowCount);

  const after = await client.query(
    `select role, count(*)::int as n
     from ${usersT}
     where role in ('USER','CUSTOMER')
       and coalesce("authUserId",'') not like 'system:%'
     group by role
     order by role`,
  );
  console.log("after:", after.rows);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

