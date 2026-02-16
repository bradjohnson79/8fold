import "dotenv/config";
import { db } from "../apps/api/db/drizzle";
import { contractors } from "../apps/api/db/schema/contractor";
import { sql, eq } from "drizzle-orm";

async function main() {
  const contractorId = "730b0014-cc23-4b8d-b61e-84532a6b0f96";
  
  await db.update(contractors)
    .set({
      tradeCategories: ["HANDYMAN", "JUNK_REMOVAL"] as any,
      categories: ["handyman", "junk_removal"] as any,
    })
    .where(eq(contractors.id, contractorId));
  
  console.log("✓ Updated BC contractor to support both HANDYMAN and JUNK_REMOVAL");
  process.exit(0);
}

main().catch(console.error);
