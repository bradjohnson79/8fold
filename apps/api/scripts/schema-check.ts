#!/usr/bin/env tsx
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { validateSchema } from "@/src/services/schema/schemaGuard";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const appRoot = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(appRoot, ".env.local") });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await validateSchema(client, {
      schema: "directory_engine",
      failOnMismatch: true,
    });
    console.log("schema:check OK — directory_engine lead tables match contract");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
