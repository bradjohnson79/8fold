import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { assertJobDraftTransition } from "../../../../../../src/jobs/jobDraftTransitions";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobDrafts } from "../../../../../../db/schema/jobDraft";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../job-drafts/:id/submit
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const result = await db.transaction(async (tx: any) => {
      const currentRows = await tx.select().from(jobDrafts).where(eq(jobDrafts.id, id)).limit(1);
      const current = currentRows[0] ?? null;
      if (!current) return { kind: "not_found" as const };

      assertJobDraftTransition((current as any).status, "IN_REVIEW");

      const now = new Date();
      const updated = await tx
        .update(jobDrafts)
        .set({ status: "IN_REVIEW", updatedAt: now } as any)
        .where(eq(jobDrafts.id, id))
        .returning();
      const jobDraft = updated[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "JOB_DRAFT_SUBMIT",
        entityType: "JobDraft",
        entityId: jobDraft.id,
        metadata: { from: (current as any).status, to: jobDraft.status } as any,
      });

      return { kind: "ok" as const, jobDraft };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, data: { jobDraft: result.jobDraft } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/job-drafts/:id/submit", { route: "/api/admin/job-drafts/[id]/submit", userId: auth.userId });
  }
}

