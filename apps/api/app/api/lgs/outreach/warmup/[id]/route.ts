/**
 * LGS: Warmup actions for a single sender.
 * POST /api/lgs/outreach/warmup/[id]  body: { action: "start" | "pause" | "advance" | "reset" }
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { senderPool } from "@/db/schema/directoryEngine";
import { getDailyLimit } from "@/src/services/lgs/warmupSchedule";
import { checkSendEligibility } from "@/src/services/lgs/warmupEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action;

    const [sender] = await db.select().from(senderPool).where(eq(senderPool.id, id)).limit(1);
    if (!sender) return NextResponse.json({ ok: false, error: "sender_not_found" }, { status: 404 });

    let updates: Partial<typeof senderPool.$inferInsert> = { updatedAt: new Date() };

    if (action === "start") {
      if (sender.warmupStatus === "warming") {
        return NextResponse.json({ ok: false, error: "warmup_already_running" }, { status: 400 });
      }
      const resuming = sender.warmupStatus === "paused";
      const day = resuming ? (sender.warmupDay ?? 1) : 1;
      const currentDayStartedAt = new Date();
      const dailyLimit = getDailyLimit(day);
      const initialEligibility = checkSendEligibility({
        currentDayStartedAt,
        warmupSentToday: 0,
        warmupBudget: dailyLimit,
      });
      updates = {
        ...updates,
        warmupStatus: "warming",
        warmupStartedAt: sender.warmupStartedAt ?? new Date(),
        warmupDay: day,
        currentDayStartedAt,
        dailyLimit,
        warmupSentToday: 0,
        outreachSentToday: 0,
        sentToday: 0,
        warmupEmailsSentToday: 0,
        outreachEnabled: false,
        warmupInboxPlacement: "good",
        nextWarmupSendAt: initialEligibility.nextSendAt,
      };
    } else if (action === "pause") {
      if (sender.warmupStatus !== "warming") {
        return NextResponse.json({ ok: false, error: "warmup_not_running" }, { status: 400 });
      }
      updates = {
        ...updates,
        warmupStatus: "paused",
        nextWarmupSendAt: null as unknown as undefined,
      };
    } else if (action === "advance") {
      const nextDay = Math.min((sender.warmupDay ?? 0) + 1, 5);
      const currentDayStartedAt = new Date();
      const dailyLimit = getDailyLimit(nextDay);
      const initialWarmupBudget = nextDay >= 5 ? Math.min(3, dailyLimit) : dailyLimit;
      const initialEligibility = checkSendEligibility({
        currentDayStartedAt,
        warmupSentToday: 0,
        warmupBudget: initialWarmupBudget,
      });
      updates = {
        ...updates,
        warmupDay: nextDay,
        dailyLimit,
        currentDayStartedAt,
        warmupSentToday: 0,
        outreachSentToday: 0,
        sentToday: 0,
        warmupEmailsSentToday: 0,
        outreachEnabled: nextDay >= 5,
        warmupStatus: nextDay >= 5 ? "ready" : "warming",
        nextWarmupSendAt: initialEligibility.nextSendAt,
      };
    } else if (action === "reset") {
      updates = {
        ...updates,
        warmupStatus: "not_started",
        warmupStartedAt: null as unknown as undefined,
        warmupDay: 0,
        currentDayStartedAt: null as unknown as undefined,
        dailyLimit: 50,
        warmupSentToday: 0,
        outreachSentToday: 0,
        sentToday: 0,
        warmupEmailsSentToday: 0,
        warmupTotalSent: 0,
        warmupTotalReplies: 0,
        warmupInboxPlacement: "unknown",
        outreachEnabled: false,
        nextWarmupSendAt: null as unknown as undefined,
        lastWarmupSentAt: null as unknown as undefined,
        lastWarmupResult: null as unknown as undefined,
        lastWarmupRecipient: null as unknown as undefined,
      };
    } else {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }

    const [updated] = await db
      .update(senderPool)
      .set(updates)
      .where(eq(senderPool.id, id))
      .returning();

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        warmup_status: updated.warmupStatus,
        warmup_day: updated.warmupDay,
        daily_limit: updated.dailyLimit,
        outreach_enabled: updated.outreachEnabled,
      },
    });
  } catch (err) {
    console.error("LGS warmup action error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
