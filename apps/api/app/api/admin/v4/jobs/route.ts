import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { listAdminJobs, parseJobsListParams } from "@/src/services/adminV4/jobsReadService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = parseJobsListParams(searchParams);
    const data = await listAdminJobs(params);

    // Keep backward compatibility for existing pages that still read `jobs`.
    return ok({
      ...data,
      jobs: data.rows,
    });
  } catch (error) {
    console.error("[ADMIN_V4_JOBS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOBS_LIST_FAILED", "Failed to load jobs");
  }
}
