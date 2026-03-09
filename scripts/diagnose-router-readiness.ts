import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const sql = neon(DATABASE_URL);

const ROUTER_USER_ID = "d6e3f65d-659d-4eaa-8465-f63e3bb45961";

async function main() {
  console.log("=== Router Readiness & Available Jobs Diagnostic ===\n");
  console.log(`Router user ID: ${ROUTER_USER_ID}\n`);

  // 1. Payout methods for this router
  console.log("--- 1. Payout Methods ---");
  const payoutMethods = await sql`
    SELECT id, "userId", provider, currency, "isActive", details, "createdAt", "updatedAt"
    FROM "PayoutMethod"
    WHERE "userId" = ${ROUTER_USER_ID}
    ORDER BY "createdAt" DESC
  `;
  if (payoutMethods.length === 0) {
    console.log("  NO PayoutMethod rows found!");
  } else {
    for (const pm of payoutMethods) {
      console.log(`  PayoutMethod ${pm.id}:`);
      console.log(`    provider: ${pm.provider}, currency: ${pm.currency}, isActive: ${pm.isActive}`);
      console.log(`    details: ${JSON.stringify(pm.details, null, 2)}`);
      console.log(`    created: ${pm.createdAt}, updated: ${pm.updatedAt}`);
    }
  }

  // 2. Readiness simulation
  const activeStripe = payoutMethods.find(
    (pm: any) => pm.provider === "STRIPE" && pm.isActive
  );
  if (activeStripe) {
    const d = activeStripe.details as any;
    const hasId = String(d?.stripeAccountId ?? "").trim().length > 0;
    const enabled = ["true", "t", "1", "yes"].includes(String(d?.stripePayoutsEnabled ?? "").toLowerCase());
    const simulated = ["true", "t", "1", "yes"].includes(String(d?.stripeSimulatedApproved ?? "").toLowerCase());
    console.log(`\n--- 2. Payment Gate Simulation ---`);
    console.log(`  stripeAccountId: ${d?.stripeAccountId} (present: ${hasId})`);
    console.log(`  stripePayoutsEnabled: ${d?.stripePayoutsEnabled} (truthy: ${enabled})`);
    console.log(`  stripeSimulatedApproved: ${d?.stripeSimulatedApproved} (truthy: ${simulated})`);
    console.log(`  => PAYMENT GATE: ${hasId && (enabled || simulated) ? "PASS" : "FAIL"}`);
  } else {
    console.log("\n--- 2. Payment Gate Simulation ---");
    console.log("  No active STRIPE payout method found => PAYMENT GATE: FAIL");
  }

  // 3. Jobs - all statuses for CA
  console.log("\n--- 3. All CA Jobs by Status ---");
  const caStats = await sql`
    SELECT status::text, routing_status::text, COUNT(*)::int as count
    FROM jobs
    WHERE country_code::text = 'CA'
    GROUP BY status, routing_status
    ORDER BY count DESC
  `;
  console.table(caStats);

  // 4. BC jobs specifically
  console.log("--- 4. BC Jobs by Status ---");
  const bcStats = await sql`
    SELECT status::text, routing_status::text,
           UPPER(TRIM(COALESCE(region_code, state_code, ''))) as effective_region,
           COUNT(*)::int as count
    FROM jobs
    WHERE country_code::text = 'CA'
      AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')
    GROUP BY status, routing_status, effective_region
    ORDER BY count DESC
  `;
  if (bcStats.length === 0) {
    console.log("  NO BC jobs exist at all!");
  } else {
    console.table(bcStats);
  }

  // 5. Jobs that WOULD match available jobs query
  console.log("--- 5. Jobs Matching Available Jobs Query (BC, CA) ---");
  const availableJobs = await sql`
    SELECT id, title, status::text, routing_status::text,
           country_code::text, region_code, state_code,
           contractor_user_id, cancel_request_pending, archived_at
    FROM jobs
    WHERE country_code::text = 'CA'
      AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
      AND status::text = 'OPEN_FOR_ROUTING'
      AND routing_status::text = 'UNROUTED'
      AND contractor_user_id IS NULL
      AND COALESCE(cancel_request_pending, false) = false
      AND archived_at IS NULL
    ORDER BY id DESC
    LIMIT 20
  `;
  if (availableJobs.length === 0) {
    console.log("  NO matching jobs! Breaking down why...\n");

    // Check each filter individually
    const total = await sql`SELECT COUNT(*)::int as c FROM jobs WHERE country_code::text = 'CA'`;
    console.log(`  Total CA jobs: ${total[0].c}`);

    const bcTotal = await sql`
      SELECT COUNT(*)::int as c FROM jobs
      WHERE country_code::text = 'CA'
        AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')`;
    console.log(`  CA + BC region: ${bcTotal[0].c}`);

    const openForRouting = await sql`
      SELECT COUNT(*)::int as c FROM jobs
      WHERE country_code::text = 'CA'
        AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')
        AND status::text = 'OPEN_FOR_ROUTING'`;
    console.log(`  CA + BC + OPEN_FOR_ROUTING: ${openForRouting[0].c}`);

    const unrouted = await sql`
      SELECT COUNT(*)::int as c FROM jobs
      WHERE country_code::text = 'CA'
        AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')
        AND status::text = 'OPEN_FOR_ROUTING'
        AND routing_status::text = 'UNROUTED'`;
    console.log(`  CA + BC + OPEN_FOR_ROUTING + UNROUTED: ${unrouted[0].c}`);

    const noContractor = await sql`
      SELECT COUNT(*)::int as c FROM jobs
      WHERE country_code::text = 'CA'
        AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')
        AND status::text = 'OPEN_FOR_ROUTING'
        AND routing_status::text = 'UNROUTED'
        AND contractor_user_id IS NULL`;
    console.log(`  + contractor_user_id IS NULL: ${noContractor[0].c}`);

    const notCancelled = await sql`
      SELECT COUNT(*)::int as c FROM jobs
      WHERE country_code::text = 'CA'
        AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')
        AND status::text = 'OPEN_FOR_ROUTING'
        AND routing_status::text = 'UNROUTED'
        AND contractor_user_id IS NULL
        AND COALESCE(cancel_request_pending, false) = false
        AND archived_at IS NULL`;
    console.log(`  + not cancelled + not archived: ${notCancelled[0].c}`);

    // Show what statuses BC jobs actually have
    console.log("\n  BC job statuses:");
    const bcStatuses = await sql`
      SELECT status::text, COUNT(*)::int as c
      FROM jobs
      WHERE country_code::text = 'CA'
        AND (UPPER(TRIM(region_code)) = 'BC' OR UPPER(TRIM(state_code)) = 'BC')
      GROUP BY status
      ORDER BY c DESC`;
    console.table(bcStatuses);
  } else {
    console.table(availableJobs);
  }

  // 6. All OPEN_FOR_ROUTING jobs anywhere
  console.log("\n--- 6. All OPEN_FOR_ROUTING Jobs (any region) ---");
  const allOpen = await sql`
    SELECT id, title, status::text, routing_status::text,
           country_code::text, region_code, state_code
    FROM jobs
    WHERE status::text = 'OPEN_FOR_ROUTING'
    LIMIT 20
  `;
  if (allOpen.length === 0) {
    console.log("  NO OPEN_FOR_ROUTING jobs in entire database!");
  } else {
    console.table(allOpen);
  }

  console.log("\n=== Diagnostic complete ===");
}

main().catch(console.error);
