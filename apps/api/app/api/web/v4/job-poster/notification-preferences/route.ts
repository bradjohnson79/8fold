import { NextResponse } from "next/server";
import { z } from "zod";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getPreferences, updatePreferences } from "@/src/services/v4/notifications/notificationService";

const BodySchema = z.object({
  items: z.array(
    z.object({
      type: z.string().trim().min(1),
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
    }),
  ),
});

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  const prefs = await getPreferences({ userId: role.userId, role: "JOB_POSTER" });
  return NextResponse.json({ ok: true, ...prefs }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ ok: false, error: "Invalid preferences payload" }, { status: 400 });

  const prefs = await updatePreferences({ userId: role.userId, role: "JOB_POSTER", items: body.data.items });
  return NextResponse.json({ ok: true, ...prefs }, { headers: { "cache-control": "no-store" } });
}
