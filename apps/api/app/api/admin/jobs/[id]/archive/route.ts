import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { adminAuditLog } from "@/src/audit/adminAudit";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/archive
  return parts[parts.length - 2] ?? "";
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const jobId = getIdFromUrl(req);
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Invalid jobId" }, { status: 400 });
  }

  try {
    // Idempotent archive: set archived=true. No other side effects.
    const updatedRows = await db
      .update(jobs)
      .set({ archived: true } as any)
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id, archived: jobs.archived });
    const updated = updatedRows[0] ?? null;
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await adminAuditLog(req, auth, {
      action: "ADMIN_JOB_ARCHIVE",
      entityType: "Job",
      entityId: jobId,
      metadata: { archived: true },
    });

    return NextResponse.json({ ok: true, data: { job: updated } });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/jobs/:id/archive", { route: "/api/admin/jobs/[id]/archive", userId: auth.userId });
  }
}

