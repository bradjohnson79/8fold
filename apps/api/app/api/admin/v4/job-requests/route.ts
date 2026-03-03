import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobEditRequests, jobCancelRequests } from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const typeFilter = String(searchParams.get("type") ?? "").trim().toLowerCase();

  try {
    const editRows =
      typeFilter === "cancel"
        ? []
        : await db
            .select({
              id: jobEditRequests.id,
              jobId: jobEditRequests.jobId,
              jobPosterId: jobEditRequests.jobPosterId,
              originalTitle: jobEditRequests.originalTitle,
              originalDescription: jobEditRequests.originalDescription,
              requestedTitle: jobEditRequests.requestedTitle,
              requestedDescription: jobEditRequests.requestedDescription,
              status: jobEditRequests.status,
              createdAt: jobEditRequests.createdAt,
            })
            .from(jobEditRequests)
            .where(eq(jobEditRequests.status, "pending"))
            .orderBy(desc(jobEditRequests.createdAt))
            .limit(100);

    const cancelRows =
      typeFilter === "edit"
        ? []
        : await db
            .select({
              id: jobCancelRequests.id,
              jobId: jobCancelRequests.jobId,
              jobPosterId: jobCancelRequests.jobPosterId,
              reason: jobCancelRequests.reason,
              status: jobCancelRequests.status,
              createdAt: jobCancelRequests.createdAt,
            })
            .from(jobCancelRequests)
            .where(eq(jobCancelRequests.status, "pending"))
            .orderBy(desc(jobCancelRequests.createdAt))
            .limit(100);

    const editRequests = editRows.map((r) => ({
      id: r.id,
      type: "edit" as const,
      jobId: r.jobId,
      jobPosterId: r.jobPosterId,
      originalTitle: r.originalTitle,
      originalDescription: r.originalDescription,
      requestedTitle: r.requestedTitle,
      requestedDescription: r.requestedDescription,
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    const cancelRequests = cancelRows.map((r) => ({
      id: r.id,
      type: "cancel" as const,
      jobId: r.jobId,
      jobPosterId: r.jobPosterId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    return ok({ editRequests, cancelRequests });
  } catch (e) {
    console.error("[ADMIN_V4_JOB_REQUESTS_LIST]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_V4_JOB_REQUESTS_FAILED", "Failed to list job requests");
  }
}
