import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { contractors } from "../../../../../../db/schema/contractor";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../contractors/:id/reject
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const updated = await db
      .update(contractors)
      .set({ status: "REJECTED", approvedAt: null } as any)
      .where(eq(contractors.id, id))
      .returning({ id: contractors.id, status: contractors.status, approvedAt: contractors.approvedAt });
    const contractor = updated[0] ?? null;
    if (!contractor) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
        actorUserId: auth.userId,
        action: "CONTRACTOR_REJECT",
        entityType: "Contractor",
        entityId: contractor.id,
    });

    return NextResponse.json({ ok: true, data: { contractor } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/contractors/[id]/reject");
  }
}

