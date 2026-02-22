import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

function yyyyMmDd(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}_${mm}_${dd}`;
}

function schemaFromDatabaseUrl(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }
  const schema = schemaFromDatabaseUrl(databaseUrl);
  const now = new Date();
  const stamp = yyyyMmDd(now);

  const c = new Client({ connectionString: databaseUrl });
  await c.connect();

  const summary: any = {
    schema,
    generatedAt: now.toISOString(),
    totalEscrows: 0,
    escrowAmountInvalid: 0,
    escrowFundedWithoutLedger: 0,
    duplicateStripeCheckoutSessionId: 0,
    duplicateStripePaymentIntentId: 0,
    orphanedEscrows: 0,
    pnmAmountInvalid: 0,
    pnmPaidWithoutEscrow: 0,
    pnmMissingParents: 0,
    ledgerAmountInvalid: 0,
    ledgerMissingParents: 0,
    ledgerNegativeNetJobs: 0,
    ledgerImmutabilityEnforced: false,
    overallStatus: "FAIL" as "PASS" | "FAIL",
  };

  const details: Record<string, any[]> = {};
  const addDetails = (k: string, rows: any[]) => {
    if (rows.length) details[k] = rows;
  };

  // A) Escrow integrity
  const escrowsTotal = await c.query(`select count(*)::int as c from "${schema}"."Escrow"`);
  summary.totalEscrows = Number((escrowsTotal.rows[0] as any)?.c ?? 0);

  const escrowAmountInvalid = await c.query(
    `select "id","jobId","amountCents" from "${schema}"."Escrow" where "amountCents" <= 0`,
  );
  summary.escrowAmountInvalid = escrowAmountInvalid.rowCount;
  addDetails("escrowAmountInvalid", escrowAmountInvalid.rows);

  const escrowFundedWithoutLedger = await c.query(
    `
    select e."id" as "escrowId", e."jobId", e."kind", e."amountCents", e."currency"
    from "${schema}"."Escrow" e
    left join "${schema}"."LedgerEntry" l
      on l."escrowId" = e."id"
     and l."direction" = 'CREDIT'::"${schema}"."LedgerDirection"
     and l."type" in ('ESCROW_FUND'::"${schema}"."LedgerEntryType", 'PNM_FUND'::"${schema}"."LedgerEntryType")
    where e."status" = 'FUNDED'::"${schema}"."EscrowStatus"
      and l."id" is null
    `,
  );
  summary.escrowFundedWithoutLedger = escrowFundedWithoutLedger.rowCount;
  addDetails("escrowFundedWithoutLedger", escrowFundedWithoutLedger.rows);

  const dupCheckout = await c.query(
    `
    select "stripeCheckoutSessionId", count(*)::int as c
    from "${schema}"."Escrow"
    where "stripeCheckoutSessionId" is not null
    group by "stripeCheckoutSessionId"
    having count(*) > 1
    `,
  );
  summary.duplicateStripeCheckoutSessionId = dupCheckout.rowCount;
  addDetails("duplicateStripeCheckoutSessionId", dupCheckout.rows);

  const dupPi = await c.query(
    `
    select "stripePaymentIntentId", count(*)::int as c
    from "${schema}"."Escrow"
    where "stripePaymentIntentId" is not null
    group by "stripePaymentIntentId"
    having count(*) > 1
    `,
  );
  summary.duplicateStripePaymentIntentId = dupPi.rowCount;
  addDetails("duplicateStripePaymentIntentId", dupPi.rows);

  const orphanedEscrows = await c.query(
    `
    select e."id" as "escrowId", e."jobId"
    from "${schema}"."Escrow" e
    left join "${schema}"."jobs" j on j."id" = e."jobId"
    where j."id" is null
    `,
  );
  summary.orphanedEscrows = orphanedEscrows.rowCount;
  addDetails("orphanedEscrows", orphanedEscrows.rows);

  // B) Parts & Materials integrity
  const pnmAmountInvalid = await c.query(
    `select "id","jobId","contractorId","amountCents" from "${schema}"."PartsMaterialRequest" where "amountCents" <= 0`,
  );
  summary.pnmAmountInvalid = pnmAmountInvalid.rowCount;
  addDetails("pnmAmountInvalid", pnmAmountInvalid.rows);

  const pnmPaidWithoutEscrow = await c.query(
    `
    select "id","jobId","contractorId","status"
    from "${schema}"."PartsMaterialRequest"
    where "status" = 'PAID'::"${schema}"."PartsMaterialStatus"
      and "escrowId" is null
    `,
  );
  summary.pnmPaidWithoutEscrow = pnmPaidWithoutEscrow.rowCount;
  addDetails("pnmPaidWithoutEscrow", pnmPaidWithoutEscrow.rows);

  const pnmMissingParents = await c.query(
    `
    select p."id", p."jobId", p."contractorId"
    from "${schema}"."PartsMaterialRequest" p
    left join "${schema}"."jobs" j on j."id" = p."jobId"
    left join "${schema}"."Contractor" c on c."id" = p."contractorId"
    where j."id" is null or c."id" is null
    `,
  );
  summary.pnmMissingParents = pnmMissingParents.rowCount;
  addDetails("pnmMissingParents", pnmMissingParents.rows);

  // C) Ledger integrity
  const ledgerAmountInvalid = await c.query(
    `select "id","jobId","escrowId","amountCents" from "${schema}"."LedgerEntry" where "amountCents" <= 0`,
  );
  summary.ledgerAmountInvalid = ledgerAmountInvalid.rowCount;
  addDetails("ledgerAmountInvalid", ledgerAmountInvalid.rows);

  const ledgerMissingParents = await c.query(
    `
    select l."id", l."jobId", l."escrowId"
    from "${schema}"."LedgerEntry" l
    left join "${schema}"."jobs" j on j."id" = l."jobId"
    left join "${schema}"."Escrow" e on e."id" = l."escrowId"
    where (l."jobId" is not null and j."id" is null)
       or (l."escrowId" is not null and e."id" is null)
    `,
  );
  summary.ledgerMissingParents = ledgerMissingParents.rowCount;
  addDetails("ledgerMissingParents", ledgerMissingParents.rows);

  const negativeNetJobs = await c.query(
    `
    with sums as (
      select
        "jobId",
        sum(case when "direction" = 'CREDIT'::"${schema}"."LedgerDirection" then "amountCents" else 0 end)::int as credit,
        sum(case when "direction" = 'DEBIT'::"${schema}"."LedgerDirection" then "amountCents" else 0 end)::int as debit
      from "${schema}"."LedgerEntry"
      where "jobId" is not null
      group by "jobId"
    )
    select "jobId", credit, debit, (credit - debit) as net
    from sums
    where (credit - debit) < 0
    order by net asc
    `,
  );
  summary.ledgerNegativeNetJobs = negativeNetJobs.rowCount;
  addDetails("ledgerNegativeNetJobs", negativeNetJobs.rows);

  // Ledger immutability smoke check:
  // - Prefer a real DB action: attempt to update an existing row.
  // - If table is empty, fall back to trigger existence check.
  const triggerCheck = await c.query(
    `
    select tg.tgname
    from pg_trigger tg
    join pg_class cl on cl.oid = tg.tgrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = $1 and cl.relname = 'LedgerEntry' and not tg.tgisinternal
    order by tg.tgname
    `,
    [schema],
  );
  const triggers = triggerCheck.rows.map((r: any) => String(r.tgname));
  const hasNoUpdate = triggers.includes("ledger_entry_no_update");
  const hasNoDelete = triggers.includes("ledger_entry_no_delete");

  const anyLedger = await c.query(`select "id"::text as id from "${schema}"."LedgerEntry" limit 1`);
  if (anyLedger.rowCount === 0) {
    summary.ledgerImmutabilityEnforced = hasNoUpdate && hasNoDelete;
    if (!summary.ledgerImmutabilityEnforced) {
      addDetails("ledgerImmutabilityMissingTriggers", [{ triggers }]);
    }
  } else {
    const id = String((anyLedger.rows[0] as any).id);
    try {
      await c.query("BEGIN");
      await c.query(`update "${schema}"."LedgerEntry" set "memo" = 'immutability_probe' where "id" = $1::uuid`, [id]);
      await c.query("ROLLBACK");
      summary.ledgerImmutabilityEnforced = false; // update succeeded -> FAIL
      addDetails("ledgerImmutabilityUpdateSucceeded", [{ id }]);
    } catch (e: any) {
      await c.query("ROLLBACK").catch(() => null);
      summary.ledgerImmutabilityEnforced = true;
    }
  }

  const failCount =
    summary.escrowAmountInvalid +
    summary.escrowFundedWithoutLedger +
    summary.duplicateStripeCheckoutSessionId +
    summary.duplicateStripePaymentIntentId +
    summary.orphanedEscrows +
    summary.pnmAmountInvalid +
    summary.pnmPaidWithoutEscrow +
    summary.pnmMissingParents +
    summary.ledgerAmountInvalid +
    summary.ledgerMissingParents +
    summary.ledgerNegativeNetJobs +
    (summary.ledgerImmutabilityEnforced ? 0 : 1);

  summary.overallStatus = failCount === 0 ? "PASS" : "FAIL";

  const reportLines: string[] = [];
  reportLines.push(`## FINANCIAL AUDIT REPORT (${stamp})`);
  reportLines.push("");
  reportLines.push(`- **schema**: \`${schema}\``);
  reportLines.push(`- **generatedAt**: \`${now.toISOString()}\``);
  reportLines.push(`- **OVERALL_STATUS**: **${summary.overallStatus}**`);
  reportLines.push("");
  reportLines.push("### Summary JSON");
  reportLines.push("");
  reportLines.push("```json");
  reportLines.push(JSON.stringify(summary, null, 2));
  reportLines.push("```");
  reportLines.push("");

  if (summary.overallStatus === "FAIL") {
    reportLines.push("### Fail Details");
    reportLines.push("");
    for (const [k, rows] of Object.entries(details)) {
      reportLines.push(`#### ${k}`);
      reportLines.push("");
      reportLines.push("```json");
      reportLines.push(JSON.stringify(rows, null, 2));
      reportLines.push("```");
      reportLines.push("");
    }
  }

  await c.end();

  // apps/api/scripts -> repo root
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const outPath = path.resolve(repoRoot, `docs/FINANCIAL_AUDIT_REPORT_${stamp}.md`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, reportLines.join("\n"), "utf8");

  console.log(JSON.stringify(summary));
  console.log(`Wrote ${outPath}`);
  console.log(`OVERALL_STATUS: ${summary.overallStatus}`);

  process.exit(summary.overallStatus === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  console.log("OVERALL_STATUS: FAIL");
  process.exit(1);
});

