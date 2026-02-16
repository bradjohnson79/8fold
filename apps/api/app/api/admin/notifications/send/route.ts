import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../../../../../db/drizzle";
import { notificationDeliveries } from "../../../../../db/schema/notificationDelivery";
import { users } from "../../../../../db/schema/user";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  jobId: z.string().trim().min(1).optional(),

  // targeting
  all: z.boolean().optional(),
  roles: z.array(z.enum(["ADMIN", "JOB_POSTER", "ROUTER", "CONTRACTOR"])).min(1).optional(),
  userIds: z.array(z.string().trim().min(1)).min(1).max(500).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

    const targetAll = body.data.all === true;
    const roles = body.data.roles ?? null;
    const userIds = body.data.userIds ?? null;

    if (!targetAll && !roles && !userIds) {
      return NextResponse.json({ ok: false, error: "targeting_required" }, { status: 400 });
    }

    let recipients: string[] = [];

    if (targetAll) {
      const rows = await db.select({ id: users.id }).from(users).limit(100000);
      recipients = rows.map((r: any) => r.id);
    } else if (roles) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.role, roles as any))
        .limit(100000);
      recipients = rows.map((r: any) => r.id);
    } else if (userIds) {
      // validate existence (avoid creating garbage deliveries)
      const rows = await db.select({ id: users.id }).from(users).where(inArray(users.id, userIds)).limit(100000);
      recipients = rows.map((r: any) => r.id);
    }

    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, data: { sent: 0 } });
    }

    const now = new Date();
    const values = recipients.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      title: body.data.title,
      body: body.data.body,
      createdAt: now,
      readAt: null,
      createdByAdminUserId: auth.userId,
      jobId: body.data.jobId ?? null,
    }));

    // Insert in chunks to avoid oversized queries.
    const CHUNK = 500;
    for (let i = 0; i < values.length; i += CHUNK) {
      await db.insert(notificationDeliveries).values(values.slice(i, i + CHUNK));
    }

    return NextResponse.json({ ok: true, data: { sent: recipients.length } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/notifications/send");
  }
}

