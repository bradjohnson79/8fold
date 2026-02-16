import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../../../db/schema/auditLog";
import { contractors } from "../../../../db/schema/contractor";
import { users } from "../../../../db/schema/user";
import { requireUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { z } from "zod";

const WAIVER_VERSION = "1.0";

const BodySchema = z.object({
  accepted: z.literal(true)
});

function getRequestIp(req: Request): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

/**
 * Contractor Waiver (web-only)
 * - Stored via AuditLog (no schema changes)
 * - Versioned + timestamped + includes IP
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);

    // Primary source of truth: waiver accepted by the User (entityType=User).
    const userLatestRows = await db
      .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
          eq(auditLogs.entityType, "User"),
          eq(auditLogs.entityId, u.userId),
          eq(auditLogs.actorUserId, u.userId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const userLatest = userLatestRows[0] ?? null;

    const meta = (userLatest?.metadata ?? null) as any;
    const acceptedVersion = typeof meta?.version === "string" ? meta.version : null;
    const acceptedAt = typeof meta?.acceptedAt === "string" ? meta.acceptedAt : null;

    return NextResponse.json({
      ok: true,
      agreementType: "CONTRACTOR_WAIVER",
      currentVersion: WAIVER_VERSION,
      accepted: Boolean(userLatest),
      acceptedCurrent: acceptedVersion === WAIVER_VERSION,
      acceptedVersion,
      acceptedAt: acceptedAt ?? (userLatest ? userLatest.createdAt.toISOString() : null)
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const existingUserRows = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
          eq(auditLogs.entityType, "User"),
          eq(auditLogs.entityId, u.userId),
          eq(auditLogs.actorUserId, u.userId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const existingUser = existingUserRows[0] ?? null;

    const meta = (existingUser?.metadata ?? null) as any;
    const acceptedVersion = typeof meta?.version === "string" ? meta.version : null;
    if (acceptedVersion === WAIVER_VERSION) {
      return NextResponse.json({ ok: true, alreadyAccepted: true, version: WAIVER_VERSION });
    }

    const acceptedAtIso = new Date().toISOString();
    const ip = getRequestIp(req);

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: u.userId,
      action: "CONTRACTOR_WAIVER_ACCEPTED",
      entityType: "User",
      entityId: u.userId,
      metadata: {
        agreementType: "CONTRACTOR_WAIVER",
        version: WAIVER_VERSION,
        acceptedAt: acceptedAtIso,
        ip,
      } as any,
    });

    // Back-compat: if a Contractor profile exists for this user, also log it on the Contractor entity.
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, u.userId))
      .limit(1);
    const user = userRows[0] ?? null;
    if (user?.email) {
      const contractorRows = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(eq(contractors.email, user.email))
        .limit(1);
      const contractor = contractorRows[0] ?? null;
      if (contractor) {
        const existingContractorRows = await db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
              eq(auditLogs.entityType, "Contractor"),
              eq(auditLogs.entityId, contractor.id),
              eq(auditLogs.actorUserId, user.id),
            ),
          )
          .limit(1);
        const existingContractor = existingContractorRows[0] ?? null;
        if (!existingContractor) {
          await db.insert(auditLogs).values({
            id: randomUUID(),
            actorUserId: user.id,
            action: "CONTRACTOR_WAIVER_ACCEPTED",
            entityType: "Contractor",
            entityId: contractor.id,
            metadata: {
              agreementType: "CONTRACTOR_WAIVER",
              version: WAIVER_VERSION,
              acceptedAt: acceptedAtIso,
              ip,
            } as any,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, alreadyAccepted: false, version: WAIVER_VERSION });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

