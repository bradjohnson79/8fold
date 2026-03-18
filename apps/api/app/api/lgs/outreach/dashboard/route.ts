/**
 * LGS Outreach: Dashboard aggregates.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorContacts,
  emailMessages,
  emailQueue,
} from "@/db/schema/directoryEngine";

export async function GET() {
  try {
    const [
      totalContacts,
      pendingContacts,
      sentContacts,
      messagesPendingReview,
      queuePending,
      queueSent,
      queueFailed,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(contractorContacts),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorContacts)
        .where(eq(contractorContacts.status, "pending")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorContacts)
        .where(eq(contractorContacts.status, "sent")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(emailMessages)
        .where(eq(emailMessages.approved, false)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(emailQueue)
        .where(eq(emailQueue.sendStatus, "pending")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(emailQueue)
        .where(eq(emailQueue.sendStatus, "sent")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(emailQueue)
        .where(eq(emailQueue.sendStatus, "failed")),
    ]);

    const toNum = (r: { c: unknown }[]) => Number((r[0] as { c: number })?.c ?? 0);

    return NextResponse.json({
      ok: true,
      data: {
        totalContacts: toNum(totalContacts),
        pendingContacts: toNum(pendingContacts),
        sentContacts: toNum(sentContacts),
        messagesPendingReview: toNum(messagesPendingReview),
        queuePending: toNum(queuePending),
        queueSent: toNum(queueSent),
        queueFailed: toNum(queueFailed),
      },
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") {
      // relation does not exist — tables not migrated yet; return zeros
      return NextResponse.json({
        ok: true,
        data: {
          totalContacts: 0,
          pendingContacts: 0,
          sentContacts: 0,
          messagesPendingReview: 0,
          queuePending: 0,
          queueSent: 0,
          queueFailed: 0,
        },
      });
    }
    console.error("LGS outreach dashboard error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
