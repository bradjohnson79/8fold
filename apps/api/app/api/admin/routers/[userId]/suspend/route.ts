import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { routers } from "../../../../../../db/schema/router";
import { users } from "../../../../../../db/schema/user";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function getUserIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../routers/:userId/suspend
  return parts[parts.length - 3] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = getUserIdFromUrl(req);

    const updated = await db
      .update(routers)
      .set({ status: "SUSPENDED" } as any)
      .where(eq(routers.userId, userId))
      .returning({ userId: routers.userId, status: routers.status });
    const router = updated[0] ?? null;

    if (!router) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await db.update(users).set({ status: "SUSPENDED" } as any).where(eq(users.id, userId));

    await db.insert(auditLogs).values({
      id: randomUUID(),
        actorUserId: auth.userId,
        action: "ROUTER_SUSPEND",
        entityType: "User",
        entityId: userId,
        metadata: { status: "SUSPENDED" } as any,
    });

    return NextResponse.json({ ok: true, data: { router } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/routers/[userId]/suspend");
  }
}

