import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { ContractorUpdateInputSchema } from "@8fold/shared";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractors } from "../../../../../db/schema/contractor";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const rows = await db.select().from(contractors).where(eq(contractors.id, id)).limit(1);
    const contractor = rows[0] ?? null;
    if (!contractor) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: { contractor } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/contractors/[id]");
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const body = await req.json();
    const parsed = ContractorUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const contractor = await db.transaction(async (tx: any) => {
      const updated = await tx
        .update(contractors)
        .set(parsed.data as any)
        .where(eq(contractors.id, id))
        .returning();
      const row = updated[0] ?? null;
      if (!row) throw Object.assign(new Error("Not found"), { status: 404 });

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "CONTRACTOR_UPDATE",
        entityType: "Contractor",
        entityId: row.id,
        metadata: { updatedFields: Object.keys(parsed.data) } as any,
      });

      return row;
    });

    return NextResponse.json({ ok: true, data: { contractor } });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/contractors/[id]");
  }
}

