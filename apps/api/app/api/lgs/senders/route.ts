/**
 * LGS: List sender pool.
 */
import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { senderPool } from "@/db/schema/directoryEngine";

export async function GET() {
  try {
    const rows = await db.select().from(senderPool).orderBy(senderPool.senderEmail);

    const data = rows.map((r) => ({
      id: r.id,
      sender_email: r.senderEmail,
      gmail_connected: r.gmailConnected,
      gmail_token_expires_at: r.gmailTokenExpiresAt?.toISOString() ?? null,
      sent_today: r.sentToday,
      daily_limit: r.dailyLimit,
      last_sent_at: r.lastSentAt?.toISOString() ?? null,
      status: r.status,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") return NextResponse.json({ ok: true, data: [] });
    console.error("LGS senders error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
