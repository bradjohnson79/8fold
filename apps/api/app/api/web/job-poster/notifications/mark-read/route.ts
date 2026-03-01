import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { z } from "zod";
import { markRead } from "@/src/services/v4/notifications/notificationService";

const BodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(200),
});

export async function POST(req: Request) {
  try {
    console.warn("[NOTIFICATIONS_LEGACY_ROUTE_DEPRECATED]", {
      path: "/api/web/job-poster/notifications/mark-read",
      method: "POST",
    });
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

    await markRead({
      userId: u.userId,
      role: "JOB_POSTER",
      ids: body.data.ids,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
