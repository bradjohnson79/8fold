import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { listJobPosters, parseRoleUsersListParams } from "@/src/services/adminV4/usersReadService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = parseRoleUsersListParams(searchParams);
    const data = await listJobPosters(params);
    return ok(data);
  } catch (error) {
    console.error("[ADMIN_V4_JOB_POSTERS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_POSTERS_LIST_FAILED", "Failed to load job posters");
  }
}
