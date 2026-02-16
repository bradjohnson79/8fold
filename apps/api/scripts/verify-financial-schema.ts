import { Client } from "pg";

type ColExpectation = {
  name: string;
  dataType: string; // information_schema.data_type
  udtName: string; // information_schema.udt_name
  nullable: "YES" | "NO";
  defaultIncludes?: string; // substring to look for in column_default (if any)
};

function schemaFromDatabaseUrl(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function getCols(c: Client, schema: string, table: string) {
  const r = await c.query(
    `
    select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = $1 and table_name = $2
    order by ordinal_position
    `,
    [schema, table],
  );
  return r.rows as Array<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>;
}

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }
  const schema = schemaFromDatabaseUrl(databaseUrl);
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();

  const expected: Record<string, ColExpectation[]> = {
    Escrow: [
      { name: "id", dataType: "uuid", udtName: "uuid", nullable: "NO", defaultIncludes: "gen_random_uuid" },
      { name: "jobId", dataType: "text", udtName: "text", nullable: "NO" },
      { name: "kind", dataType: "USER-DEFINED", udtName: "EscrowKind", nullable: "NO" },
      { name: "amountCents", dataType: "integer", udtName: "int4", nullable: "NO" },
      { name: "currency", dataType: "USER-DEFINED", udtName: "CurrencyCode", nullable: "NO" },
      { name: "status", dataType: "USER-DEFINED", udtName: "EscrowStatus", nullable: "NO" },
      { name: "stripeCheckoutSessionId", dataType: "text", udtName: "text", nullable: "YES" },
      { name: "stripePaymentIntentId", dataType: "text", udtName: "text", nullable: "YES" },
      { name: "webhookProcessedAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: "YES" },
      { name: "createdAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: "NO", defaultIncludes: "CURRENT_TIMESTAMP" },
      { name: "updatedAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: "NO", defaultIncludes: "CURRENT_TIMESTAMP" },
    ],
    PartsMaterialRequest: [
      { name: "id", dataType: "uuid", udtName: "uuid", nullable: "NO", defaultIncludes: "gen_random_uuid" },
      { name: "jobId", dataType: "text", udtName: "text", nullable: "NO" },
      { name: "contractorId", dataType: "text", udtName: "text", nullable: "NO" },
      { name: "amountCents", dataType: "integer", udtName: "int4", nullable: "NO" },
      { name: "description", dataType: "text", udtName: "text", nullable: "NO" },
      { name: "status", dataType: "USER-DEFINED", udtName: "PartsMaterialStatus", nullable: "NO" },
      { name: "escrowId", dataType: "uuid", udtName: "uuid", nullable: "YES" },
      { name: "createdAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: "NO", defaultIncludes: "CURRENT_TIMESTAMP" },
      { name: "updatedAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: "NO", defaultIncludes: "CURRENT_TIMESTAMP" },
    ],
    LedgerEntry: [
      { name: "id", dataType: "uuid", udtName: "uuid", nullable: "NO", defaultIncludes: "gen_random_uuid" },
      { name: "createdAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: "NO", defaultIncludes: "CURRENT_TIMESTAMP" },
      { name: "userId", dataType: "text", udtName: "text", nullable: "NO" },
      { name: "jobId", dataType: "text", udtName: "text", nullable: "YES" },
      { name: "escrowId", dataType: "uuid", udtName: "uuid", nullable: "YES" },
      { name: "type", dataType: "USER-DEFINED", udtName: "LedgerEntryType", nullable: "NO" },
      { name: "direction", dataType: "USER-DEFINED", udtName: "LedgerDirection", nullable: "NO" },
      { name: "bucket", dataType: "USER-DEFINED", udtName: "LedgerBucket", nullable: "NO" },
      { name: "amountCents", dataType: "integer", udtName: "int4", nullable: "NO" },
      { name: "currency", dataType: "USER-DEFINED", udtName: "CurrencyCode", nullable: "NO" },
      { name: "stripeRef", dataType: "text", udtName: "text", nullable: "YES" },
      { name: "memo", dataType: "text", udtName: "text", nullable: "YES" },
    ],
  };

  let ok = true;
  for (const [table, ex] of Object.entries(expected)) {
    const cols = await getCols(c, schema, table);
    const byName = new Map(cols.map((r) => [r.column_name, r]));

    for (const exp of ex) {
      const col = byName.get(exp.name);
      if (!col) {
        ok = false;
        fail(`${schema}.${table} missing column ${exp.name}`);
        continue;
      }
      if (col.data_type !== exp.dataType || col.udt_name !== exp.udtName || col.is_nullable !== exp.nullable) {
        ok = false;
        fail(
          `${schema}.${table}.${exp.name} expected (${exp.dataType}, ${exp.udtName}, nullable=${exp.nullable}) got (${col.data_type}, ${col.udt_name}, nullable=${col.is_nullable})`,
        );
      }
      if (exp.defaultIncludes) {
        const def = col.column_default ?? "";
        if (!def.includes(exp.defaultIncludes)) {
          ok = false;
          fail(`${schema}.${table}.${exp.name} default mismatch: expected to include ${exp.defaultIncludes}, got ${def}`);
        }
      }
    }
  }

  await c.end();

  if (ok) {
    console.log("VERIFY_FINANCIAL_SCHEMA: PASS");
    process.exit(0);
  } else {
    console.log("VERIFY_FINANCIAL_SCHEMA: FAIL");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

