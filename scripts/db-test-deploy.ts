import "dotenv/config";
import { spawnSync } from "node:child_process";

/**
 * Applies Prisma migrations to DATABASE_URL_TEST (separate schema/db).
 *
 * Why this exists:
 * - Prisma loads .env, but shell scripts don't automatically export those vars.
 * - We want deterministic test DB deployment without touching prod schema.
 */

function main() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl || testUrl.trim().length === 0) {
    console.error("Missing DATABASE_URL_TEST in .env");
    process.exit(1);
  }

  const result = spawnSync(
    "pnpm",
    ["-s", "prisma", "migrate", "deploy"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testUrl
      }
    }
  );

  process.exit(result.status ?? 1);
}

main();

