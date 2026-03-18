import path from "node:path";
import dotenv from "dotenv";
import { validateWarmupSystem } from "../src/services/lgs/warmupSystem";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local"),
});

async function main() {
  const result = await validateWarmupSystem();

  console.log(JSON.stringify(result, null, 2));

  if (!result.pass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
