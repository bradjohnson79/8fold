import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4ContractorSuspensions } from "@/db/schema/v4ContractorSuspension";

/**
 * Returns true if contractor is currently suspended (suspendedUntil > now).
 * Used by requireContractorV4 and routes that use requireAuth + CONTRACTOR role.
 */
export async function isContractorSuspended(contractorUserId: string): Promise<boolean> {
  const rows = await db
    .select({ suspendedUntil: v4ContractorSuspensions.suspendedUntil })
    .from(v4ContractorSuspensions)
    .where(eq(v4ContractorSuspensions.contractorUserId, contractorUserId))
    .limit(1);
  const suspension = rows[0] ?? null;
  const now = new Date();
  return !!(suspension && suspension.suspendedUntil > now);
}
