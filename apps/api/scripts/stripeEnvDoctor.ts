#!/usr/bin/env tsx
/**
 * Stripe Env Doctor: diagnose STRIPE_SECRET_KEY from .env.local
 *
 * - Reads apps/api/.env.local from disk (not process.env)
 * - Parses STRIPE_SECRET_KEY, detects mangling (CRLF, asterisks, quotes, etc.)
 * - Prints prefix/suffix/length, CLEAN/UNCLEAN, and safe export line
 * - Runs curl to Stripe API with parsed key to verify auth (no shell sourcing)
 *
 * Run: pnpm -C apps/api stripe:env-doctor
 *      pnpm -C apps/api stripe:env-doctor --print-full  (print full key)
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "..", ".env.local");

function parseEnvFile(path: string): Map<string, string> {
  let raw = readFileSync(path, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip BOM
  const out = new Map<string, string>();

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip trailing inline comment (unquoted # to EOL)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const hashIdx = value.indexOf("#");
      if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
    }

    // Strip optional quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Strip CR (CRLF)
    value = value.replace(/\r/g, "");

    out.set(key, value);
  }
  return out;
}

function diagnose(value: string): { clean: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (value.includes("*")) reasons.push("contains asterisk(s)");
  if (/\s/.test(value)) reasons.push("contains whitespace");
  if (value.includes('"') || value.includes("'")) reasons.push("contains quote chars");
  if (/\r/.test(value)) reasons.push("contains CR (CRLF)");
  if (/[^\x00-\x7F]/.test(value)) reasons.push("contains non-ASCII chars");
  if (value.startsWith("sk_") && value.includes("****")) reasons.push("contains masked ****");
  if (!value.startsWith("sk_live_")) {
    if (value.startsWith("sk_test_")) reasons.push("key is sk_test_ (live test expected); use sk_live_ for LIVE");
    else reasons.push("expected key to start with sk_live_");
  }

  if (value.includes("#")) reasons.push("trailing comment or # in value");

  return { clean: reasons.length === 0, reasons };
}

function sanitize(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ") // nbsp -> space
    .replace(/[\u200b-\u200d\ufeff]/g, "") // zero-width chars, BOM
    .trim();
}

function main() {
  const printFull = process.argv.includes("--print-full");

  let env: Map<string, string>;
  try {
    env = parseEnvFile(ENV_PATH);
  } catch (err) {
    console.error("stripeEnvDoctor: Could not read", ENV_PATH, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const raw = env.get("STRIPE_SECRET_KEY") ?? "";
  const value = sanitize(raw);

  if (!value) {
    console.error("stripeEnvDoctor: STRIPE_SECRET_KEY not found in", ENV_PATH);
    process.exit(1);
  }

  const { clean, reasons } = diagnose(value);
  const prefix = value.slice(0, 12);
  const suffix = value.slice(-6);
  const len = value.length;

  console.log("STRIPE_SECRET_KEY diagnosis:");
  console.log("  prefix:", prefix);
  console.log("  suffix:", suffix);
  console.log("  length:", len);
  console.log("  status:", clean ? "CLEAN" : "UNCLEAN");

  if (!clean) {
    console.log("  reasons:", reasons.join("; "));
    const lineNum = findLineNumber(ENV_PATH, "STRIPE_SECRET_KEY");
    if (lineNum >= 0) {
      console.log("  patch: Replace line", lineNum, "with:");
      console.log("    STRIPE_SECRET_KEY=" + value);
    }
  }

  const safeExport = value.replace(/'/g, "'\\''");
  console.log("\nSafe export (bash/zsh):");
  console.log("  export STRIPE_SECRET_KEY='" + (printFull ? safeExport : prefix + "..." + suffix) + "'");
  if (!printFull) console.log("  (use --print-full to emit full key for copy-paste)");

  // Curl auth check
  console.log("\nStripe auth check:");
  const result = spawnSync(
    "curl",
    [
      "-s",
      "-D",
      "-",
      "https://api.stripe.com/v1/customers",
      "-u",
      value + ":",
      "-d",
      "name=stripeEnvDoctor",
      "-d",
      "metadata[run]=stripe-env-doctor",
    ],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );

  const stderr = result.stderr || "";
  const stdout = result.stdout || "";

  const headerBlock = stdout.split("\r\n\r\n")[0] || stdout.split("\n\n")[0] || "";
  const firstLine = headerBlock.split("\r\n")[0] || headerBlock.split("\n")[0] || "";

  if (firstLine) {
    console.log(" ", firstLine);
  }

  if (result.status !== 0 && !firstLine) {
    console.log("  (curl failed:", result.status + ")");
  }

  // If non-200, try to parse JSON error and redact key
  if (!firstLine.includes("200")) {
    const body = stdout.split("\r\n\r\n")[1] || stdout.split("\n\n")[1] || stdout;
    try {
      const json = JSON.parse(body);
      const msg =
        (json.error && typeof json.error.message === "string" ? json.error.message : json.message) || JSON.stringify(json);
      console.log("  Error:", String(msg).replace(/sk_(live|test)_[a-zA-Z0-9]+/g, "sk_$1_***REDACTED***"));
    } catch {
      if (body.trim()) console.log("  Body:", body.slice(0, 200));
    }
  }

  process.exit(clean && firstLine.includes("200") ? 0 : 1);
}

function findLineNumber(path: string, key: string): number {
  try {
    const raw = readFileSync(path, "utf-8");
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith(key + "=")) return i + 1;
    }
  } catch {
    return -1;
  }
  return -1;
}

main();
