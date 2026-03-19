import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { lgsOutreachQueue } from "@/db/schema/directoryEngine";
import { WARMUP_SCHEDULE } from "@/src/services/lgs/warmupSchedule";
import { getWarmupDashboardData } from "@/src/services/lgs/warmupSystem";
import { ensureWarmupWorkerFresh } from "@/src/warmup/warmupWorker";

export async function GET() {
  try {
    await ensureWarmupWorkerFresh();

    const pendingRow = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(lgsOutreachQueue)
      .where(eq(lgsOutreachQueue.sendStatus, "pending"))
      .then((result) => result[0]);

    const dashboard = await getWarmupDashboardData({
      pendingQueueCount: Number(pendingRow?.cnt ?? 0),
    });

    return NextResponse.json({
      ok: true,
      data: dashboard.data,
      summary: {
        ...dashboard.summary,
        schedule: WARMUP_SCHEDULE,
      },
    });
  } catch (err) {
    console.error("LGS warmup list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
