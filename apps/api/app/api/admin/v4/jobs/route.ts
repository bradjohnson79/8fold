import { jobsRepo, mapJobsRowsToAdminJobDTO, requireAdmin } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = jobsRepo.parseJobsQuery(searchParams);
    const data = await jobsRepo.list(params);
    const rows = mapJobsRowsToAdminJobDTO(data.rows as any[]);

    return ok({
      ...data,
      rows,
      jobs: rows,
    });
  } catch (error) {
    console.error("[ADMIN_V4_JOBS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOBS_LIST_FAILED", "Failed to load jobs");
  }
}
