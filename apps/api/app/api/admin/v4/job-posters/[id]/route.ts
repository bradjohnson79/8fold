import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getJobPosterDetail } from "@/src/services/adminV4/usersReadService";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const data = await getJobPosterDetail(id);
    if (!data) return err(404, "ADMIN_V4_JOB_POSTER_NOT_FOUND", "Job poster not found");
    return ok(data);
  } catch (error) {
    console.error("[ADMIN_V4_JOB_POSTER_DETAIL_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_POSTER_DETAIL_FAILED", "Failed to load job poster detail");
  }
}
