import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { assertJobDraftTransition } from "../../../../../../src/jobs/jobDraftTransitions";
import { AdminDecisionInputSchema } from "@8fold/shared";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobDrafts } from "../../../../../../db/schema/jobDraft";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../job-drafts/:id/needs-clarification
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const decision = AdminDecisionInputSchema.safeParse(j.json);
    if (!decision.success) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const result = await db.transaction(async (tx: any) => {
      const currentRows = await tx.select().from(jobDrafts).where(eq(jobDrafts.id, id)).limit(1);
      const current = currentRows[0] ?? null;
      if (!current) return { kind: "not_found" as const };

      assertJobDraftTransition((current as any).status, "NEEDS_CLARIFICATION");

      const now = new Date();
      const updated = await tx
        .update(jobDrafts)
        .set({ status: "NEEDS_CLARIFICATION", updatedAt: now } as any)
        .where(eq(jobDrafts.id, id))
        .returning();
      const jobDraft = updated[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "JOB_DRAFT_NEEDS_CLARIFICATION",
        entityType: "JobDraft",
        entityId: jobDraft.id,
        metadata: { from: (current as any).status, to: jobDraft.status, ...decision.data } as any,
      });

      return { kind: "ok" as const, jobDraft };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, data: { jobDraft: result.jobDraft } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/job-drafts/:id/needs-clarification", { route: "/api/admin/job-drafts/[id]/needs-clarification", userId: auth.userId });
  }
}

