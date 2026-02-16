import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { notificationDeliveries } from "../../../../../db/schema/notificationDelivery";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const rows = await db
      .select({
        id: notificationDeliveries.id,
        title: notificationDeliveries.title,
        body: notificationDeliveries.body,
        createdAt: notificationDeliveries.createdAt,
        readAt: notificationDeliveries.readAt,
        jobId: notificationDeliveries.jobId,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, u.userId))
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(80);

    const unreadCountRows = await db
      .select({ c: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.userId, u.userId), isNull(notificationDeliveries.readAt)))
      .limit(5000);

    return NextResponse.json({
      notifications: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
      })),
      unreadCount: unreadCountRows.length,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

