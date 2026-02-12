/**
 * Verify Drizzle pgEnum definitions exactly match Postgres enum labels + order.
 *
 * Run:
 *   pnpm exec tsx scripts/verify-drizzle-enums-match-postgres.ts
 */
import path from "node:path";
import { Client } from "pg";
import { pgEnum } from "drizzle-orm/pg-core";

// Import after dotenv + PG connect check (but it's fine: pgEnum is pure).
import * as enums from "../apps/api/db/schema/enums";

type DrizzleEnum = ReturnType<typeof pgEnum>;

function isDrizzleEnum(x: unknown): x is DrizzleEnum {
  // drizzle pgEnum(...) returns a callable (function) with enum metadata attached
  return (
    !!x &&
    (typeof x === "function" || typeof x === "object") &&
    "enumName" in (x as any) &&
    "enumValues" in (x as any)
  );
}

const ENUM_SQL = `
SELECT e.enumlabel AS enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '8fold_test' AND t.typname = $1
ORDER BY e.enumsortorder;
`.trim();

async function main() {
  const repoRoot = process.cwd();

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const drizzleEnums: Array<{ exportName: string; enumName: string; values: string[] }> = [];
  for (const [k, v] of Object.entries(enums)) {
    if (isDrizzleEnum(v)) {
      drizzleEnums.push({ exportName: k, enumName: (v as any).enumName, values: (v as any).enumValues as string[] });
    }
  }
  drizzleEnums.sort((a, b) => a.enumName.localeCompare(b.enumName));

  const mismatches: Array<{
    enumName: string;
    exportName: string;
    postgres: string[];
    drizzle: string[];
    reason: string;
  }> = [];

  for (const e of drizzleEnums) {
    const rows = await pg.query(ENUM_SQL, [e.enumName]).then((r) => r.rows);
    const pgVals = rows.map((r: any) => String(r.enumlabel));

    const sameLen = pgVals.length === e.values.length;
    const sameOrder = sameLen && pgVals.every((x, i) => x === e.values[i]);
    if (!sameOrder) {
      mismatches.push({
        enumName: e.enumName,
        exportName: e.exportName,
        postgres: pgVals,
        drizzle: e.values,
        reason: sameLen ? "Different order or labels" : "Different length (missing/extra labels)",
      });
    }
  }

  await pg.end();

  if (mismatches.length) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          ok: false,
          mismatches: mismatches.map((m) => ({
            enumName: m.enumName,
            exportName: m.exportName,
            reason: m.reason,
            postgres: m.postgres,
            drizzle: m.drizzle,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, checked: drizzleEnums.length }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

