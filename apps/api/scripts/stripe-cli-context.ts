#!/usr/bin/env tsx
/**
 * Stripe CLI Mode + Account Context
 *
 * Prints CLI version, active account, and whether CLI commands target TEST or LIVE mode.
 * Use this to confirm the CLI is targeting the same Stripe account as the browser Dashboard.
 *
 * Run: pnpm -C apps/api stripe:cli-context
 * Or:  tsx apps/api/scripts/stripe-cli-context.ts
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "stripe", "config.toml");

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    return "";
  }
}

function safeReadConfig(): string {
  try {
    return readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    return "";
  }
}

function extractAccountId(config: string): string | null {
  const m = config.match(/account_id\s*=\s*['"](acct_[^'"]+)['"]/);
  return m ? m[1] : null;
}

function main() {
  console.log("=== Stripe CLI Context ===\n");

  const version = run("stripe --version");
  console.log("1. Stripe CLI version:", version || "(not found)");
  if (!version) {
    console.error("\nInstall Stripe CLI: https://docs.stripe.com/stripe-cli");
    process.exit(1);
  }

  const configList = run("stripe config --list");
  let accountId = configList ? extractAccountId(configList) : null;
  if (!accountId) {
    const config = safeReadConfig();
    accountId = config ? extractAccountId(config) : null;
  }
  if (accountId) {
    console.log("2. Account ID:", accountId);
    console.log("   Dashboard URL (test): https://dashboard.stripe.com/test/...");
    console.log("   Dashboard URL (live): https://dashboard.stripe.com/?account=" + accountId);
  } else {
    console.log("2. Account ID: (run 'stripe login' to configure)");
  }

  console.log("\n3. CLI mode behavior:");
  console.log("   - By default, stripe trigger/listen use TEST mode (sk_test_*, livemode=false)");
  console.log("   - Add --live to use LIVE mode (sk_live_*, livemode=true)");
  console.log("   - stripe trigger does NOT support --live; it only creates TEST events");
  console.log("   - stripe events resend --live evt_xxx --webhook-endpoint=we_xxx can resend LIVE events");

  console.log("\n4. Verify account match:");
  console.log("   - Open https://dashboard.stripe.com and check the URL for acct_...");
  console.log("   - Ensure it matches the Account ID above");
  console.log("   - Toggle test/live in the Dashboard to see which mode you're viewing");

  console.log("\n5. Expected outputs (reference):");
  console.log("   stripe --version     => stripe version 1.x.x");
  console.log("   stripe config --list  => account_id = 'acct_...'");
  process.exit(0);
}

main();
