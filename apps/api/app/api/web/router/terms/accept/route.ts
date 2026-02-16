import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { routers } from "../../../../../../db/schema/router";
import { requireRouter } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";

const TERMS_VERSION = "v1.0";

function getRequestIp(req: Request): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  try {
    const router = await requireRouter(req);

    const existingRows = await db
      .select({ termsAccepted: routers.termsAccepted })
      .from(routers)
      .where(eq(routers.userId, router.userId))
      .limit(1);
    const existing = existingRows[0] ?? null;

    if (!existing) {
      return NextResponse.json({ error: "Router not provisioned" }, { status: 403 });
    }

    if (!existing.termsAccepted) {
      const nowIso = new Date().toISOString();
      const ip = getRequestIp(req);

      await db.transaction(async (tx) => {
        await tx.update(routers).set({ termsAccepted: true }).where(eq(routers.userId, router.userId));
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: router.userId,
          action: "ROUTER_TERMS_ACCEPTED",
          entityType: "User",
          entityId: router.userId,
          metadata: {
            agreementType: "ROUTER_TERMS",
            version: TERMS_VERSION,
            acceptedAt: nowIso,
            ip,
          } as any,
        });
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

