import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getIndexingLogs } from "@/src/services/v4/seo/indexingService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(200, Math.max(1, limitParam ? Number(limitParam) : 50));

    const logs = await getIndexingLogs(isNaN(limit) ? 50 : limit);
    return ok({ logs });
  } catch (e) {
    console.error("[seo/indexing/logs GET]", e);
    return err(500, "SEO_LOGS_ERROR", "Failed to load indexing logs");
  }
}
