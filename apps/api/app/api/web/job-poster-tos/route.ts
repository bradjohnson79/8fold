import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../../../db/schema/auditLog";
import { requireUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { z } from "zod";

const TOS_VERSION = "1.0";

const BodySchema = z.object({
  accepted: z.literal(true),
  version: z.string().trim().min(1),
});

function getRequestIp(req: Request): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);

    const rows = await db
      .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "JOB_POSTER_TOS_ACCEPTED"),
          eq(auditLogs.entityType, "User"),
          eq(auditLogs.entityId, u.userId),
          eq(auditLogs.actorUserId, u.userId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const latest = rows[0] ?? null;

    const meta = (latest?.metadata ?? null) as any;
    const acceptedVersion = typeof meta?.version === "string" ? meta.version : null;
    const acceptedAt = typeof meta?.acceptedAt === "string" ? meta.acceptedAt : null;
    const acceptedCurrent = acceptedVersion === TOS_VERSION;

    return NextResponse.json({
      ok: true,
      agreementType: "JOB_POSTER_TOS",
      currentVersion: TOS_VERSION,
      accepted: Boolean(latest),
      acceptedCurrent,
      acceptedVersion,
      acceptedAt: acceptedAt ?? (latest ? latest.createdAt.toISOString() : null)
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (!u?.userId) return NextResponse.json({ error: "Could not record acceptance" }, { status: 400 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Could not record acceptance" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Could not record acceptance" }, { status: 400 });
    if (body.data.version !== TOS_VERSION) return NextResponse.json({ error: "Could not record acceptance" }, { status: 400 });

    const existingRows = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "JOB_POSTER_TOS_ACCEPTED"),
          eq(auditLogs.entityType, "User"),
          eq(auditLogs.entityId, u.userId),
          eq(auditLogs.actorUserId, u.userId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const existing = existingRows[0] ?? null;

    const meta = (existing?.metadata ?? null) as any;
    const acceptedVersion = typeof meta?.version === "string" ? meta.version : null;
    if (acceptedVersion === TOS_VERSION) {
      return NextResponse.json({ ok: true, alreadyAccepted: true, version: TOS_VERSION });
    }

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: u.userId,
      action: "JOB_POSTER_TOS_ACCEPTED",
      entityType: "User",
      entityId: u.userId,
      metadata: {
        agreementType: "JOB_POSTER_TOS",
        version: TOS_VERSION,
        acceptedAt: new Date().toISOString(),
        ip: getRequestIp(req),
      } as any,
    });

    return NextResponse.json({ ok: true, alreadyAccepted: false, version: TOS_VERSION });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

