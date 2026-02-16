import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { notificationDeliveries } from "../../../../../../db/schema/notificationDelivery";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { z } from "zod";

const BodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const now = new Date();
    await db
      .update(notificationDeliveries)
      .set({ readAt: now })
      .where(
        and(
          eq(notificationDeliveries.userId, u.userId),
          inArray(notificationDeliveries.id, body.data.ids),
          isNull(notificationDeliveries.readAt),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

