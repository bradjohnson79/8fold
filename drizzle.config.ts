import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Prefer the API app's env file (single source of DATABASE_URL).
dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
if (!process.env.DATABASE_URL || String(process.env.DATABASE_URL).trim().length === 0) {
  throw new Error("DATABASE_URL is required (set it in apps/api/.env.local)");
}

// Phase 0.1: Drizzle setup only.
// - No schema files yet (placeholder path only)
// - No migrations generated or executed
// - Prisma remains active and unchanged
export default defineConfig({
  dialect: "postgresql",
  // Drizzle schema mirror lives here (read-only, no migrations generated/executed in Phase 0.2).
  schema: "./apps/api/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

