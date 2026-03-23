/**
 * LGS: Detect contractor signups and mark matching leads.
 * Run periodically (e.g. cron every 15 min).
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api exec tsx scripts/lgs-signup-detection-job.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { eq, sql } from "drizzle-orm";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

async function main() {
  const contractors = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(contractorAccounts, eq(users.id, contractorAccounts.userId))
    .where(sql`${users.role} = 'CONTRACTOR'`);

  let updated = 0;
  for (const c of contractors) {
    const email = c.email?.trim().toLowerCase();
    if (!email) continue;

    const result = await db
      .update(contractorLeads)
      .set({ signedUp: true, updatedAt: new Date() })
      .where(sql`lower(${contractorLeads.email}) = ${email} and ${contractorLeads.signedUp} = false`)
      .returning({ id: contractorLeads.id });

    updated += result.length;
  }

  console.log(`LGS signup detection: ${updated} lead(s) marked as signed up.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
