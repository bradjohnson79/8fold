import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { lgsWarmupActivity, senderPool } from "@/db/schema/directoryEngine";
import { computeWarmupScheduleState } from "@/src/services/lgs/warmupSystem";
import { ensureWarmupWorkerFresh } from "@/src/warmup/warmupWorker";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ senderId: string }> },
) {
  try {
    await ensureWarmupWorkerFresh();
    const { senderId } = await params;
    if (!senderId) {
      return NextResponse.json({ ok: false, error: "sender_id_required" }, { status: 400 });
    }

    const [sender] = await db
      .select()
      .from(senderPool)
      .where(eq(senderPool.id, senderId))
      .limit(1);

    if (!sender) {
      return NextResponse.json({ ok: false, error: "sender_not_found" }, { status: 404 });
    }

    const activityRows = await db
      .select()
      .from(lgsWarmupActivity)
      .where(eq(lgsWarmupActivity.senderEmail, sender.senderEmail))
      .orderBy(desc(lgsWarmupActivity.sentAt))
      .limit(10);

    const schedule = computeWarmupScheduleState({
      sender,
      activityRows,
      now: new Date(),
    });

    const nextSendInSeconds = Math.max(
      0,
      Math.round((schedule.regularDueAt.getTime() - Date.now()) / 1000),
    );

    return NextResponse.json({
      ok: true,
      data: {
        next_send_in_seconds: nextSendInSeconds,
        last_send_at: sender.lastWarmupSentAt?.toISOString() ?? null,
        interval_seconds: schedule.intervalSeconds,
      },
    });
  } catch (error) {
    console.error("[LGS Warmup] next-send route error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
