import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { jobs } from "../../../../../db/schema/job";
import { toHttpError } from "../../../../../src/http/errors";
import { verifyActionToken } from "../../../../../src/jobs/actionTokens";
import { assertJobTransition } from "../../../../../src/jobs/jobTransitions";
import { z } from "zod";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/contractor-start
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  token: z.string().min(10)
});

export async function POST(req: Request) {
  try {
    const id = getIdFromUrl(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const jobRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          contractorActionTokenHash: jobs.contractor_action_token_hash,
        })
        .from(jobs)
        .where(eq(jobs.id, id))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (!verifyActionToken(body.data.token, job.contractorActionTokenHash)) return { kind: "forbidden" as const };

      // Contractor "start" is the deterministic bridge from ASSIGNED -> IN_PROGRESS.
      assertJobTransition(job.status, "IN_PROGRESS");

      const updatedRows = await tx
        .update(jobs)
        .set({ status: "IN_PROGRESS", public_status: "IN_PROGRESS" })
        .where(eq(jobs.id, id))
        .returning({
          id: jobs.id,
          status: jobs.status,
          publicStatus: jobs.public_status,
        });
      const updated = updatedRows[0] as any;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: null,
        action: "JOB_CONTRACTOR_STARTED",
        entityType: "Job",
        entityId: id,
        metadata: { toStatus: updated.status } as any,
      });

      return { kind: "ok" as const, job: updated };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ job: result.job });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

