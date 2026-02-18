import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";
import { handleApiError } from "@/src/lib/errorHandler";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { z } from "zod";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { enforceTier, requireAdminIdentityWithTier } from "../../../_lib/adminTier";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/archive
  return parts[parts.length - 2] ?? "";
}

export async function PATCH(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_OPERATOR");
  if (forbidden) return forbidden;

  const jobId = getIdFromUrl(req);
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Invalid jobId" }, { status: 400 });
  }

  try {
    const BodySchema = z.object({ reason: z.string().trim().min(3).max(500) });
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "archive_reason_required" }, { status: 400 });

    // Idempotent archive: set archived=true. No other side effects.
    const updatedRows = await db
      .update(jobs)
      .set({ archived: true } as any)
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id, archived: jobs.archived });
    const updated = updatedRows[0] ?? null;
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN" }, {
      action: "ADMIN_JOB_ARCHIVE",
      entityType: "Job",
      entityId: jobId,
      metadata: { archived: true, reason: body.data.reason },
    });

    return NextResponse.json({ ok: true, data: { job: updated } });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/jobs/:id/archive", {
      route: "/api/admin/jobs/[id]/archive",
      userId: identity.userId,
    });
  }
}

