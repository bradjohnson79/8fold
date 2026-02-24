#!/usr/bin/env tsx
/**
 * Retrieve FIN_ADMIN_ID from production (READ-ONLY).
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/retrieve-fin-admin-id.ts
 */

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  const url = mustEnv("DATABASE_URL");

  // PHASE 1 — Abort if not production
  const u = new URL(url);
  const host = u.hostname ?? "";
  if (host.includes("localhost") || host === "127.0.0.1") {
    console.error("ABORT: localhost detected");
    process.exit(1);
  }
  if (host.includes("preview")) {
    console.error("ABORT: preview detected");
    process.exit(1);
  }
  if (!host.includes("pooler")) {
    console.error("ABORT: Not Neon production pooler");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("--- PHASE 1: Production DB Confirmation ---");
  const conn = await client.query(
    "SELECT current_database() AS db_name, current_schema() AS search_path"
  );
  const r = conn.rows[0] as { db_name: string; search_path: string };
  console.log("DATABASE_URL host:", host);
  console.log("DB name:", r?.db_name ?? "?");
  console.log("search_path:", r?.search_path ?? "public");

  if (r?.search_path === "8fold_test") {
    console.error("ABORT: search_path is 8fold_test (not production)");
    process.exit(1);
  }

  // Resolve AdminUser table (AdminUser or admin_users)
  const tbl = await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_name IN ('AdminUser', 'admin_users') AND table_schema IN ('public', '8fold_test')
     ORDER BY table_schema LIMIT 1`
  );
  const schema = (tbl.rows[0] as { table_schema: string })?.table_schema ?? "public";
  const tableName = (tbl.rows[0] as { table_name: string })?.table_name ?? "AdminUser";

  const colMap = tableName === "admin_users"
    ? { id: "id", email: "email", role: "role", createdAt: "created_at" }
    : { id: '"id"', email: '"email"', role: '"role"', createdAt: '"createdAt"' };

  console.log("\n--- PHASE 2: Admin Users ---");
  const rows = await client.query(
    `SELECT ${colMap.id} AS id, ${colMap.email} AS email, ${colMap.role} AS role, ${colMap.createdAt} AS created_at
     FROM "${schema}"."${tableName}"
     ORDER BY ${colMap.createdAt} ASC`
  );

  for (const row of rows.rows as Array<{ id: string; email: string; role: string; created_at: Date }>) {
    console.log(`id=${row.id} email=${row.email} role=${row.role} created_at=${row.created_at}`);
  }

  console.log("\n--- PHASE 3: Identify SUPER Admin ---");
  const supers = (rows.rows as Array<{ id: string; email: string; role: string; created_at: Date }>).filter(
    (x) => String(x.role ?? "").toUpperCase() === "ADMIN_SUPER"
  );

  if (supers.length === 0) {
    console.error("No ADMIN_SUPER found");
    process.exit(1);
  }

  const primary = supers[0];
  if (supers.length > 1) {
    console.log("Multiple ADMIN_SUPER found; oldest as primary:");
    for (let i = 0; i < supers.length; i++) {
      console.log(`  ${i === 0 ? "[PRIMARY]" : ""} id=${supers[i].id} email=${supers[i].email}`);
    }
  }

  console.log("\n--- PHASE 4: Output ---");
  console.log(`FIN_ADMIN_ID=${primary.id}`);
  console.log(`email=${primary.email}`);
  console.log(`role=${primary.role}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
