/**
 * Sandbox utility: execute releaseJobFunds() for a given JOB_ID and verify
 * Stripe transfers exist (separate charges + transfers).
 *
 * Usage:
 *   JOB_ID=... pnpm --filter @8fold/api tsx scripts/testConnectRelease.ts
 *
 * Notes:
 * - Requires apps/api env to be configured (DATABASE_URL, STRIPE_SECRET_KEY).
 * - The target job must be FUNDED and completion-ready.
 */

import { releaseJobFunds } from "../src/payouts/releaseJobFunds";
import { stripe } from "../src/stripe/stripe";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const jobId = requireEnv("JOB_ID");
  const triggeredByUserId = process.env.TRIGGERED_BY_USER_ID ?? "system:script";
  if (!stripe) throw new Error("Stripe not configured (STRIPE_SECRET_KEY missing?)");

  console.log(`[testConnectRelease] Releasing job ${jobId} (actor=${triggeredByUserId})`);
  const out1 = await releaseJobFunds({ jobId, triggeredByUserId });
  console.log(JSON.stringify(out1, null, 2));

  if (out1.ok) {
    for (const leg of out1.legs) {
      if (leg.status !== "SENT") continue;
      const transferId = (leg as any).stripeTransferId;
      if (!transferId) continue;
      const t = await stripe.transfers.retrieve(String(transferId));
      console.log(`[stripe] ${leg.role} transfer ${t.id}: destination=${t.destination} amount=${t.amount} currency=${t.currency}`);
    }
  }

  console.log("[testConnectRelease] Re-running release for idempotency...");
  const out2 = await releaseJobFunds({ jobId, triggeredByUserId });
  console.log(JSON.stringify(out2, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

