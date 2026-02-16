import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { contractorAccounts } from "../../../../../../db/schema/contractorAccount";
import { contractors } from "../../../../../../db/schema/contractor";
import { users } from "../../../../../../db/schema/user";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../contractors/:id/suspend
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    // Unified users system: suspend a contractor user account (ContractorAccount + User.status).
    const updatedAccount = await db
      .update(contractorAccounts)
      .set({ isApproved: false } as any)
      .where(eq(contractorAccounts.userId, id))
      .returning({ userId: contractorAccounts.userId });

    if (updatedAccount.length) {
      await db.update(users).set({ status: "SUSPENDED" } as any).where(eq(users.id, id));

      await db.insert(auditLogs).values({
        id: randomUUID(),
          actorUserId: auth.userId,
          action: "CONTRACTOR_ACCOUNT_SUSPEND",
          entityType: "User",
          entityId: id,
          metadata: { status: "SUSPENDED" } as any,
      });

      const rows = await db.select().from(contractorAccounts).where(eq(contractorAccounts.userId, id)).limit(1);
      return NextResponse.json({ ok: true, data: { contractorAccount: rows[0] ?? { userId: id, isApproved: false } } });
    }

    // Legacy inventory contractor suspension (mapped to REJECTED for v1).
    const updatedContractor = await db
      .update(contractors)
      .set({ status: "REJECTED", approvedAt: null } as any)
      .where(eq(contractors.id, id))
      .returning({ id: contractors.id, status: contractors.status, approvedAt: contractors.approvedAt });
    const contractor = updatedContractor[0] ?? null;
    if (!contractor) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
        actorUserId: auth.userId,
        action: "CONTRACTOR_SUSPEND",
        entityType: "Contractor",
        entityId: contractor.id,
        metadata: { status: contractor.status } as any,
    });

    return NextResponse.json({ ok: true, data: { contractor } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/contractors/[id]/suspend");
  }
}

