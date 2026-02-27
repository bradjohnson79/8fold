import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { refundStaleUnassignedJobs } from "../src/services/escrow/refundService";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

async function main() {
  const result = await refundStaleUnassignedJobs(new Date());
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
