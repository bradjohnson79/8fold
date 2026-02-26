import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4ContractorStrikes } from "@/db/schema/v4ContractorStrike";
import { v4ContractorSuspensions } from "@/db/schema/v4ContractorSuspension";

export async function getAccountStatus(contractorUserId: string) {
  const [strikeRows, suspensionRows] = await Promise.all([
    db
      .select({ id: v4ContractorStrikes.id })
      .from(v4ContractorStrikes)
      .where(eq(v4ContractorStrikes.contractorUserId, contractorUserId)),
    db
      .select({
        suspendedUntil: v4ContractorSuspensions.suspendedUntil,
        reason: v4ContractorSuspensions.reason,
      })
      .from(v4ContractorSuspensions)
      .where(eq(v4ContractorSuspensions.contractorUserId, contractorUserId))
      .limit(1),
  ]);

  const strikeCount = strikeRows.length;
  const suspension = suspensionRows[0] ?? null;
  const now = new Date();
  const activeSuspension =
    suspension && suspension.suspendedUntil > now
      ? { suspendedUntil: suspension.suspendedUntil, reason: suspension.reason }
      : null;

  return {
    strikeCount,
    activeSuspension,
    suspensionExpiry: suspension?.suspendedUntil ?? null,
  };
}
