import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { contractors } from "../../../../../../../db/schema/contractor";
import { users } from "../../../../../../../db/schema/user";
import { requireContractorReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";

const BodySchema = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) });

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("repeat-requests") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const id = getIdFromUrl(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const userRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, u.userId))
      .limit(1);
    const user = userRows[0] ?? null;
    const email = (user?.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Missing contractor email" }, { status: 400 });

    const contractorRows = await db
      .select({ id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.status, "APPROVED"), sql`lower(${contractors.email}) = ${email}`))
      .limit(1);
    const contractor = contractorRows[0] ?? null;
    if (!contractor) return NextResponse.json({ error: "Contractor record not found" }, { status: 404 });

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const reqRes = await tx.execute(sql`
        select
          id,
          "contractorId",
          "jobId",
          status,
          "tradeCategory",
          "priorJobId"
        from "RepeatContractorRequest"
        where id = ${id}
        limit 1
      `);
      const reqRow = (reqRes.rows[0] ?? null) as any;
      if (!reqRow) return { kind: "not_found" as const };
      if (reqRow.contractorId !== contractor.id) return { kind: "forbidden" as const };
      if (reqRow.status !== "REQUESTED") return { kind: "already_responded" as const, status: reqRow.status };

      const nextStatus = body.data.decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
      const rowRes = await tx.execute(sql`
        update "RepeatContractorRequest"
        set
          status = ${nextStatus},
          "respondedAt" = ${now},
          "updatedAt" = ${now}
        where id = ${reqRow.id}
        returning id, status, "respondedAt", "jobId"
      `);
      const row = (rowRes.rows[0] ?? null) as any;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: nextStatus === "ACCEPTED" ? "REPEAT_CONTRACTOR_ACCEPTED" : "REPEAT_CONTRACTOR_DECLINED",
        entityType: "Job",
        entityId: reqRow.jobId,
        metadata: {
          contractorId: contractor.id,
          decision: body.data.decision,
          tradeCategory: reqRow.tradeCategory,
          priorJobId: reqRow.priorJobId,
        } as any,
      });

      return { kind: "ok" as const, row };
    });

    if (updated.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (updated.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (updated.kind === "already_responded") return NextResponse.json({ ok: true, status: updated.status });

    return NextResponse.json({
      ok: true,
      request: { ...updated.row, respondedAt: updated.row.respondedAt?.toISOString() ?? null }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

