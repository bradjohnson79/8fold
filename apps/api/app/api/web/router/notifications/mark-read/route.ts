import { NextResponse } from "next/server";
import { requireRouterReady } from "../../../../../../src/auth/requireRouterReady";
import { toHttpError } from "../../../../../../src/http/errors";
import { z } from "zod";
import { markRead } from "@/src/services/v4/notifications/notificationService";

const BodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(200),
});

export async function POST(req: Request) {
  try {
    console.warn("[NOTIFICATIONS_LEGACY_ROUTE_DEPRECATED]", {
      path: "/api/web/router/notifications/mark-read",
      method: "POST",
    });
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const u = authed;
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
      role: "ROUTER",
      ids: body.data.ids,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
