import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4Notifications } from "@/db/schema/v4Notification";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { disputes } from "@/db/schema/dispute";
import { launchOptIns } from "@/db/schema/launchOptIn";
import { NextResponse } from "next/server";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const ACTIVE_DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW"] as const;

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const [
      notificationsRows,
      supportRows,
      adminDisputesRows,
      messengerDisputesRows,
      launchOptInsRows,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(v4Notifications)
        .where(and(eq(v4Notifications.userId, authed.adminId), eq(v4Notifications.read, false))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(v4SupportTickets)
        .where(eq(v4SupportTickets.status, "OPEN")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(v4AdminDisputes)
        .where(inArray(v4AdminDisputes.status, [...ACTIVE_DISPUTE_STATUSES])),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(disputes)
        .where(inArray(disputes.status, [...ACTIVE_DISPUTE_STATUSES])),
      db.select({ count: sql<number>`count(*)::int` }).from(launchOptIns),
    ]);

    const notifications = Number(notificationsRows[0]?.count ?? 0);
    const support = Number(supportRows[0]?.count ?? 0);
    const disputesCount =
      Number(adminDisputesRows[0]?.count ?? 0) + Number(messengerDisputesRows[0]?.count ?? 0);
    const reviews = 0; // v4_reviews has no moderation_status yet
    const launchOptInsCount = Number(launchOptInsRows[0]?.count ?? 0);

    return NextResponse.json(
      { ok: true, data: { notifications, support, disputes: disputesCount, reviews, launchOptIns: launchOptInsCount } },
      {
        headers: {
          "Cache-Control": "public, max-age=30",
        },
      },
    );
  } catch (error) {
    console.error("[ADMIN_V4_MESSAGES_COUNTS]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return ok({
      notifications: 0,
      support: 0,
      disputes: 0,
      reviews: 0,
      launchOptIns: 0,
    });
  }
}
