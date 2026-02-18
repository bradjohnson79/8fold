import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
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
  // .../contractors/:id/approve
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const now = new Date();

    // Unified users system: if :id matches a User.id with a ContractorAccount, approve that record.
    const approvedAccount = await db.transaction(async (tx: any) => {
      const uRows = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      const role = String(uRows[0]?.role ?? "").toUpperCase();
      if (role !== "CONTRACTOR") {
        // Role immutability: admin actions must not change user.role.
        // If the user is not already a CONTRACTOR, they must create a new Clerk account.
        return { __roleImmutable: true } as any;
      }

      const updated = await tx
        .update(contractorAccounts)
        .set({ isApproved: true } as any)
        .where(eq(contractorAccounts.userId, id))
        .returning({ userId: contractorAccounts.userId });
      if (updated.length === 0) return null;

      await tx.update(users).set({ status: "ACTIVE" } as any).where(eq(users.id, id));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: auth.userId,
        action: "CONTRACTOR_ACCOUNT_APPROVE",
        entityType: "User",
        entityId: id,
        metadata: { isApproved: true } as any,
      });

      // Return the updated contractorAccount row (shape compatible with old response).
      const rows = await tx.select().from(contractorAccounts).where(eq(contractorAccounts.userId, id)).limit(1);
      return rows[0] ?? { userId: id, isApproved: true };
    });

    if ((approvedAccount as any)?.__roleImmutable) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "ROLE_IMMUTABLE", message: "Role selection is permanent and cannot be changed." },
        },
        { status: 409 },
      );
    }

    if (approvedAccount) {
      return NextResponse.json({ ok: true, data: { contractorAccount: approvedAccount } });
    }

    // Legacy inventory contractor approval (kept for v1 routing flows).
    const updatedContractor = await db
      .update(contractors)
      .set({ status: "APPROVED", approvedAt: now } as any)
      .where(eq(contractors.id, id))
      .returning({ id: contractors.id, approvedAt: contractors.approvedAt });
    const contractorRow = updatedContractor[0] ?? null;
    if (!contractorRow) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: auth.userId,
      action: "CONTRACTOR_APPROVE",
      entityType: "Contractor",
      entityId: contractorRow.id,
      metadata: { approvedAt: contractorRow.approvedAt } as any,
    });

    return NextResponse.json({ ok: true, data: { contractor: contractorRow } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/contractors/[id]/approve");
  }
}

