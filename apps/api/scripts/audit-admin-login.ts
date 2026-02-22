#!/usr/bin/env tsx
/**
 * PHASE 2: Inspect production AdminUser row for admin login audit.
 * Run: pnpm exec tsx apps/api/scripts/audit-admin-login.ts
 */
import path from "node:path";
import bcrypt from "bcryptjs";
import { Client } from "pg";

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const rows = await pg.query<{
    id: string;
    email: string;
    role: string;
    passwordHash: string;
    "createdAt": Date;
  }>(`SELECT id, email, role, "passwordHash", "createdAt" FROM public."AdminUser" ORDER BY email`);

  console.log("\n=== AdminUser rows (public schema) ===\n");
  for (const r of rows.rows) {
    const hash = r.passwordHash ?? "";
    const hashPrefix = hash.slice(0, 10);
    const isBcrypt = hash.startsWith("$2");
    const isNull = hash === "" || hash === null;
    console.log({
      id: r.id,
      email: r.email,
      role: r.role,
      passwordHashNull: isNull,
      hashPrefix,
      isBcrypt,
      createdAt: r.createdAt,
    });
  }

  const targetEmail = "bradjohnson79@gmail.com";
  const target = rows.rows.find((r) => r.email.toLowerCase() === targetEmail.toLowerCase());
  if (!target) {
    console.log(`\n❌ No AdminUser found for ${targetEmail}`);
    await pg.end();
    return;
  }

  console.log(`\n=== Hash compatibility check for ${targetEmail} ===`);
  const testPassword = "TempAdmin-8Fold-2026";
  const compareOk = await bcrypt.compare(testPassword, String(target.passwordHash)).catch(() => false);
  console.log({ testPassword, compareOk });

  if (!compareOk) {
    const newHash = await bcrypt.hash(testPassword, 10);
    console.log("\n--- Suggested fix: update with fresh bcrypt hash (10 rounds) ---");
    console.log(`UPDATE public."AdminUser" SET "passwordHash" = $1 WHERE email = $2;`);
    console.log("Params:", [newHash, target.email]);
  } else {
    console.log("\n✓ Password comparison succeeds with TempAdmin-8Fold-2026");
  }

  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
