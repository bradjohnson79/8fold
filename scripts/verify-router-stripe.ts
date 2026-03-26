/**
 * Router Stripe Verification Script
 * Queries both contractor_accounts and payout_methods for the demo router
 * to verify Admin and router pipeline see the same Stripe state.
 *
 * Run: pnpm exec tsx scripts/verify-router-stripe.ts
 */
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required. Set in apps/api/.env.local");
  process.exit(1);
}

function getSchema(dbUrl: string): string | null {
  try {
    const u = new URL(dbUrl);
    return u.searchParams.get("schema")?.trim() || null;
  } catch {
    return null;
  }
}

const ROUTER_USER_ID = "demo-router-ca-bc-001";

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url!);
  if (schema) {
    await client.query(`SET search_path TO "${schema}"`);
  }

  let pass = 0;
  let fail = 0;
  let warn = 0;

  console.log("=== Router Stripe Verification ===\n");
  console.log(`Router User ID: ${ROUTER_USER_ID}\n`);

  // Query 1: contractor_accounts
  console.log("--- contractor_accounts ---");
  const caRes = await client.query(
    `SELECT "userId", "stripeAccountId", "payoutStatus"
     FROM contractor_accounts
     WHERE "userId" = $1`,
    [ROUTER_USER_ID],
  );
  if (caRes.rows.length === 0) {
    console.log("  (no contractor_accounts row)\n");
  } else {
    for (const row of caRes.rows as any[]) {
      console.log(`  stripeAccountId : ${row.stripeAccountId ?? "(null)"}`);
      console.log(`  payoutStatus    : ${row.payoutStatus ?? "(null)"}`);
    }
    console.log("");
  }

  // Query 2: payout_methods (canonical for routers)
  console.log("--- payout_methods (canonical) ---");
  const pmRes = await client.query(
    `SELECT "userId",
            details->>'stripeAccountId' AS stripe_account_id,
            details->>'stripePayoutsEnabled' AS payouts_enabled,
            "isActive"
     FROM "PayoutMethod"
     WHERE "userId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 5`,
    [ROUTER_USER_ID],
  );
  if (pmRes.rows.length === 0) {
    console.log("  (no payout_methods rows)\n");
  } else {
    for (const row of pmRes.rows as any[]) {
      console.log(`  stripeAccountId     : ${row.stripe_account_id ?? "(null)"}`);
      console.log(`  payoutsEnabled      : ${row.payouts_enabled ?? "(null)"}`);
      console.log(`  isActive            : ${row.isActive}`);
      console.log("");
    }
  }

  // Derive connection state
  const pmRow = pmRes.rows[0] as any | undefined;
  const caRow = caRes.rows[0] as any | undefined;

  const pmStripeId = String(pmRow?.stripe_account_id ?? "").trim();
  const pmPayoutsEnabled = String(pmRow?.payouts_enabled ?? "").toLowerCase() === "true";
  const caStripeId = String(caRow?.stripeAccountId ?? "").trim();

  const connectedViaPm = Boolean(pmStripeId && pmPayoutsEnabled);
  const connectedViaCa = Boolean(caStripeId);

  console.log("--- Derived State ---");
  console.log(`  PayoutMethod connected : ${connectedViaPm ? "YES" : "NO"}`);
  console.log(`  contractor_accounts ID : ${connectedViaCa ? "YES" : "NO"}`);

  const finalState = connectedViaPm || connectedViaCa ? "CONNECTED" : "NOT CONNECTED";
  console.log(`\n  >>> ROUTER STRIPE STATUS: ${finalState}\n`);

  if (connectedViaPm) {
    console.log("  ✓ PayoutMethod has valid Stripe data");
    pass++;
  } else {
    console.log("  ✗ PayoutMethod missing or incomplete Stripe data");
    fail++;
  }

  if (connectedViaCa && !connectedViaPm) {
    console.log("  ⚠ contractor_accounts has stripeAccountId but PayoutMethod does not — possible sync issue");
    warn++;
  } else if (connectedViaPm && !connectedViaCa) {
    console.log("  ⚠ PayoutMethod has Stripe data but contractor_accounts does not — minor (CA write is best-effort)");
    warn++;
  } else if (connectedViaPm && connectedViaCa) {
    if (pmStripeId === caStripeId) {
      console.log("  ✓ Both tables have matching stripeAccountId");
      pass++;
    } else {
      console.log(`  ⚠ stripeAccountId mismatch: PM=${pmStripeId} vs CA=${caStripeId}`);
      warn++;
    }
  }

  console.log(`\n=== Summary: ${pass} pass, ${fail} fail, ${warn} warnings ===`);

  await client.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
