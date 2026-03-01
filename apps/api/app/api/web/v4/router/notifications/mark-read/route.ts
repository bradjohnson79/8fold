import { NextResponse } from "next/server";
import { z } from "zod";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { markNotificationsRead } from "@/src/services/notifications/notificationService";

const BodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).max(200).optional(),
  markAll: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const role = await requireV4Role(req, "ROUTER");
  if (role instanceof Response) return role;

  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Invalid mark-read payload" }, { status: 400 });
  }

  try {
    const updated = await markNotificationsRead({
      userId: role.userId,
      role: "ROUTER",
      ids: body.data.ids ?? [],
      markAll: body.data.markAll === true,
    });

    return NextResponse.json({ ok: true, updatedCount: updated.updatedCount }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true, updatedCount: 0 }, { status: 200 });
  }
}
