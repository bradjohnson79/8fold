import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { jobs } from "../../../../../db/schema/job";
import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { toHttpError } from "../../../../../src/http/errors";
function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/route-confirm
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const user = authed;
    const id = getIdFromUrl(req);

    const result = await db.transaction(async (tx) => {
      const currentRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          routerId: jobs.claimedByUserId, // Prisma `routerId` is mapped to DB column `claimedByUserId`
        })
        .from(jobs)
        .where(eq(jobs.id, id))
        .limit(1);
      const current = currentRows[0] ?? null;
      if (!current) return { kind: "not_found" as const };

      if (current.routerId !== user.userId) {
        return { kind: "forbidden" as const };
      }

      const updated = await tx
        .update(jobs)
        .set({ routedAt: new Date() })
        .where(eq(jobs.id, id))
        .returning({
          id: jobs.id,
          status: jobs.status,
          title: jobs.title,
          scope: jobs.scope,
          region: jobs.region,
          serviceType: jobs.serviceType,
          timeWindow: jobs.timeWindow,
          routerEarningsCents: jobs.routerEarningsCents,
          claimedAt: jobs.claimedAt,
          routedAt: jobs.routedAt,
        });
      const job = updated[0] as any;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: user.userId,
        action: "JOB_ROUTE_CONFIRM",
        entityType: "Job",
        entityId: id,
        metadata: { fromStatus: current.status, routedAt: job.routedAt } as any,
      });

      return { kind: "ok" as const, job };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ job: result.job });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

