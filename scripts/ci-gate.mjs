import { execSync } from "node:child_process";

function run(cmd, env = {}) {
  execSync(cmd, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

const isCi = String(process.env.CI ?? "").toLowerCase() === "true";
if (!isCi) {
  // Strict mode is CI-only by request; no-op locally.
  process.exit(0);
}

const baseUrl = String(process.env.BASE_URL ?? "").trim() || "http://localhost:3006";

run("pnpm -C apps/api db:verify");
run("pnpm -C apps/api test:lifecycle", { BASE_URL: baseUrl });
run("pnpm -C apps/api test:lifecycle:financial", { BASE_URL: baseUrl });

