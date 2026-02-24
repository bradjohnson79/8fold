#!/usr/bin/env tsx
/**
 * Reset an existing AdminUser password without changing role.
 *
 * Usage:
 *   ADMIN_EMAIL="bradjohnson79@gmail.com" ADMIN_PASSWORD="TempAdmin-8Fold-2026" pnpm exec tsx apps/api/scripts/reset-admin-password.ts
 */
import path from "node:path";
import process from "node:process";
import bcrypt from "bcryptjs";
import { Client } from "pg";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} missing`);
  return String(v).trim();
}

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

  const DATABASE_URL = required("DATABASE_URL");
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 chars");

  const hash = await bcrypt.hash(password, 10);
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const updates: Array<{ schema: string; id: string; email: string; role: string }> = [];
  for (const schema of ["public", "8fold_test"]) {
    const t = await pg.query(
      `select 1 as ok from information_schema.tables where table_schema = $1 and table_name = 'AdminUser' limit 1`,
      [schema],
    );
    if (!t.rows.length) continue;
    const r = await pg.query<{ id: string; email: string; role: string }>(
      `update "${schema}"."AdminUser"
         set "passwordHash" = $1
       where lower("email") = lower($2)
       returning "id","email","role"`,
      [hash, email],
    );
    if (r.rows[0]) updates.push({ schema, ...r.rows[0] });
  }
  await pg.end();

  if (!updates.length) throw new Error(`No AdminUser found for ${email}`);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, email, password, updates }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

