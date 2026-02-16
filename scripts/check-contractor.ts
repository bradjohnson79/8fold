import "dotenv/config";
import { db } from "../apps/api/db/drizzle";
import { contractors } from "../apps/api/db/schema/contractor";
import { sql } from "drizzle-orm";

async function main() {
  const c = await db.select().from(contractors).where(sql`lower(${contractors.email}) = 'contractor.bc.e2e@8fold.local'`).limit(1);
  console.log('BC Contractor:', JSON.stringify(c[0], null, 2));
  process.exit(0);
}

main().catch(console.error);
