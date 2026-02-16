import { and, desc, eq, ilike } from "drizzle-orm";
import { auditLogs } from "../../db/schema/auditLog";
import { contractors } from "../../db/schema/contractor";
import { users } from "../../db/schema/user";

export async function getApprovedContractorForUserId(
  tx: { select: any; from: any } & any,
  userId: string,
) {
  const userRows = await tx
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      role: users.role,
      status: users.status,
      country: users.country,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0] ?? null;
  const email = (user?.email ?? "").trim().toLowerCase();
  if (!user || !email) return { kind: "no_user_email" as const };

  const contractorRows = await tx
    .select({
      id: contractors.id,
      businessName: contractors.businessName,
      email: contractors.email,
      phone: contractors.phone,
      country: contractors.country,
      regionCode: contractors.regionCode,
      trade: contractors.trade,
      tradeCategories: contractors.tradeCategories,
      regions: contractors.regions,
      status: contractors.status,
    })
    .from(contractors)
    .where(and(ilike(contractors.email, email), eq(contractors.status, "APPROVED" as any)))
    .limit(1);
  const contractor = contractorRows[0] ?? null;
  if (!contractor) return { kind: "no_contractor" as const };

  return { kind: "ok" as const, user, contractor };
}

export async function hasAcceptedCurrentContractorWaiver(
  tx: { select: any; from: any } & any,
  userId: string,
  waiverVersion: string
): Promise<boolean> {
  const latestRows = await tx
    .select({ metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
        eq(auditLogs.entityType, "User"),
        eq(auditLogs.entityId, userId),
        eq(auditLogs.actorUserId, userId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  const meta = (latestRows[0]?.metadata ?? null) as any;
  return typeof meta?.version === "string" && meta.version === waiverVersion;
}

