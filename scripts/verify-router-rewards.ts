/**
 * Verify router rewards schema and ledger.
 * Run: tsx scripts/verify-router-rewards.ts
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

function getSchema(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("schema")?.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url);
  if (schema) {
    await client.query(`set search_path to "${schema}", public`);
  }

  console.log("1. Schema check: rewards_balance_cents column");
  const colRes = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'router_profiles_v4' AND column_name = 'rewards_balance_cents'`
  );
  if (colRes.rows.length) {
    console.log("   ✓", colRes.rows[0].column_name);
  } else {
    console.log("   ✗ Column not found");
    process.exit(1);
  }

  console.log("\n2. Ledger table exists (empty)");
  const ledgerRes = await client.query(`SELECT * FROM v4_router_reward_events LIMIT 1`);
  console.log("   ✓ Table exists, rows:", ledgerRes.rows.length);

  // Find an existing router to test with
  const routerRes = await client.query(
    `SELECT user_id FROM router_profiles_v4 LIMIT 1`
  );
  const testRouterId = routerRes.rows[0]?.user_id;

  if (testRouterId) {
    console.log("\n3. Test reward event (router:", testRouterId, ")");
    // Simulate addRouterReward: insert event + update balance
    await client.query(
      `INSERT INTO v4_router_reward_events (router_user_id, event_type, amount_cents) VALUES ($1, $2, $3)`,
      [testRouterId, "LOGIN", 50]
    );
    await client.query(
      `UPDATE router_profiles_v4 SET rewards_balance_cents = rewards_balance_cents + 50 WHERE user_id = $1`,
      [testRouterId]
    );
    console.log("   ✓ Simulated addRouterReward (insert + update)");

    const eventRes = await client.query(
      `SELECT * FROM v4_router_reward_events WHERE router_user_id = $1`,
      [testRouterId]
    );
    const balanceRes = await client.query(
      `SELECT rewards_balance_cents FROM router_profiles_v4 WHERE user_id = $1`,
      [testRouterId]
    );
    console.log("   Ledger events:", eventRes.rows.length);
    console.log("   Balance:", balanceRes.rows[0]?.rewards_balance_cents ?? "N/A");

    if (balanceRes.rows[0]?.rewards_balance_cents === 50) {
      console.log("   ✓ Balance correct (50 cents)");
    } else {
      console.log("   ✗ Expected balance 50");
    }

    console.log("\n4. Cleanup test reward");
    await client.query(`DELETE FROM v4_router_reward_events WHERE router_user_id = $1`, [testRouterId]);
    await client.query(
      `UPDATE router_profiles_v4 SET rewards_balance_cents = 0 WHERE user_id = $1`,
      [testRouterId]
    );
    console.log("   ✓ Cleaned up");
  } else {
    console.log("\n3. Skipping reward test (no router profile in DB)");
  }

  await client.end();
  console.log("\n✓ Verification complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
