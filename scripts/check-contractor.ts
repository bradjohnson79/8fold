import path from "node:path";
import dotenv from "dotenv";

// Env isolation: load from apps/api/.env.local only (no repo-root fallback).
dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
import { db } from "../apps/api/db/drizzle";
import { contractors } from "../apps/api/db/schema/contractor";
import { sql } from "drizzle-orm";

async function main() {
  const c = await db.select().from(contractors).where(sql`lower(${contractors.email}) = 'contractor.bc.e2e@8fold.local'`).limit(1);
  console.log('BC Contractor:', JSON.stringify(c[0], null, 2));
  process.exit(0);
}

main().catch(console.error);
