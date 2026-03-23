/**
 * LGS: Update sender (daily_limit, status).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { senderPool } from "@/db/schema/directoryEngine";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      daily_limit?: number;
      status?: string;
    };

    const dailyLimit =
      typeof body.daily_limit === "number" && body.daily_limit >= 0
        ? body.daily_limit
        : undefined;
    const status =
      typeof body.status === "string" && ["active", "paused", "inactive"].includes(body.status)
        ? body.status
        : undefined;

    if (dailyLimit === undefined && status === undefined) {
      return NextResponse.json({ ok: false, error: "daily_limit_or_status_required" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (dailyLimit != null) update.dailyLimit = dailyLimit;
    if (status != null) update.status = status;

    const [updated] = await db
      .update(senderPool)
      .set(update as { dailyLimit?: number; status?: string })
      .where(eq(senderPool.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "sender_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        sender_email: updated.senderEmail,
        sent_today: updated.sentToday,
        daily_limit: updated.dailyLimit,
        last_sent_at: updated.lastSentAt?.toISOString() ?? null,
        status: updated.status,
      },
    });
  } catch (err) {
    console.error("LGS senders PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "update_failed" },
      { status: 500 }
    );
  }
}
