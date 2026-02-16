/**
 * Deterministic Admin access recovery tool.
 *
 * Guarantees an AdminUser exists for the given email and forces role=ADMIN.
 * Also (re)sets passwordHash deterministically so local login can succeed.
 *
 * Run:
 *   pnpm exec tsx apps/api/scripts/ensure-admin-user.ts
 *   pnpm exec tsx apps/api/scripts/ensure-admin-user.ts bradjohnson79@gmail.com
 *
 * Optional env:
 *   ADMIN_EMAIL=someone@example.com
 *   ADMIN_PASSWORD='Admin12345!'        (default: Admin12345!)
 *
 * Notes:
 * - Uses Postgres pgcrypto `crypt()` + `gen_salt('bf')` (bcrypt) to avoid JS hashing deps.
 * - Targets the schema from DATABASE_URL `?schema=...` when possible.
 */
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";
import process from "node:process";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
}

function getSchemaFromDbUrl(dbUrl: string): string {
  try {
    const u = new URL(dbUrl);
    const schema = (u.searchParams.get("schema") ?? "").trim();
    if (schema && /^[a-zA-Z0-9_]+$/.test(schema)) return schema;
  } catch {
    // ignore
  }
  return "public";
}

async function resolveAdminUserSchema(pg: Client, candidates: string[]): Promise<string> {
  for (const schema of candidates) {
    try {
      const res = await pg.query(
        `select 1 as ok from information_schema.tables where table_schema = $1 and table_name = 'AdminUser' limit 1;`,
        [schema],
      );
      if ((res.rows[0]?.ok ?? null) === 1) return schema;
    } catch {
      // ignore
    }
  }
  return "public";
}

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
  dotenv.config({ path: path.join(process.cwd(), ".env") });

  const DATABASE_URL = requiredEnv("DATABASE_URL");
  const preferredSchema = getSchemaFromDbUrl(DATABASE_URL);

  const argvEmail = String(process.argv[2] ?? "").trim();
  const email = String(argvEmail || process.env.ADMIN_EMAIL || "bradjohnson79@gmail.com")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) throw new Error(`Invalid email: ${JSON.stringify(email)}`);

  const password = String(process.env.ADMIN_PASSWORD ?? "Admin12345!");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const adminSchema = await resolveAdminUserSchema(pg, [preferredSchema, "8fold_test", "public"]);

  const id = crypto.randomUUID();
  const upsert = await pg.query(
    `insert into "${adminSchema}"."AdminUser" ("id", "email", "passwordHash", "role")
     values ($1, $2, public.crypt($3, public.gen_salt('bf', 10)), $4)
     on conflict ("email") do update
       set "role" = excluded."role",
           "passwordHash" = excluded."passwordHash"
     returning "id", "email", "role";`,
    [id, email, password, "ADMIN"],
  );

  const row = (upsert.rows[0] ?? null) as { id: string; email: string; role: string } | null;
  if (!row?.id) throw new Error("Upsert did not return an id");

  await pg.end();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        adminSchema,
        adminUser: row,
        login: { email: row.email, password },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

