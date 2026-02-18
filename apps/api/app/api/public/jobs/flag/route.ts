import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest } from "../../../../../src/lib/api/respond";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../../../db/schema/job";
import { jobFlags } from "../../../../../db/schema/jobFlag";
import { optionalUser } from "@/src/auth/rbac";

const BodySchema = z.object({
  jobId: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(3).max(200),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return badRequest("invalid_body");

    const { jobId, reason } = parsed.data;

    // Only allow flagging non-archived jobs (job must exist).
    const exists = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.archived, false)))
      .limit(1);
    if (!exists.length) {
      return Response.json({ ok: false, error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });
    }

    // Optional identity: allow anonymous flags, but store userId when available.
    const u = await optionalUser(req);
    const userId: string | null = u?.userId ?? null;

    await db.insert(jobFlags).values({
      jobId,
      userId,
      reason,
    } as any);

    // Match prompt: simple ok payload (not wrapped).
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "POST /api/public/jobs/flag");
  }
}

