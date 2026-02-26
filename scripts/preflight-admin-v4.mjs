#!/usr/bin/env node
import { execSync } from "node:child_process";

const REQUIRED_BRANCH = "v4-admin";

function currentBranch() {
  return execSync("git branch --show-current", { encoding: "utf8" }).trim();
}

try {
  const branch = currentBranch();
  if (branch !== REQUIRED_BRANCH) {
    console.error(`[admin-v4 preflight] failed: current branch is "${branch}", expected "${REQUIRED_BRANCH}"`);
    process.exit(1);
  }
  console.log(`[admin-v4 preflight] ok: ${branch}`);
} catch (e) {
  console.error("[admin-v4 preflight] failed to detect git branch");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
