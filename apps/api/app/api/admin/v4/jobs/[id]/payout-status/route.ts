import { requireAdmin } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getPayoutStatusByJobId } from "@/src/services/v4/payouts/releaseFundsService";

export const dynamic = "force-dynamic";

function getJobId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/");
  return String(parts[parts.length - 2] ?? "").trim();
}

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  const jobId = getJobId(req);
  if (!jobId) {
    return err(400, "JOB_ID_REQUIRED", "Missing job id");
  }

  try {
    const status = await getPayoutStatusByJobId(jobId);
    if (!status.found) {
      return err(404, "JOB_NOT_FOUND", "Job not found");
    }
    return ok(status);
  } catch (error) {
    console.error("[ADMIN_V4_PAYOUT_STATUS_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_PAYOUT_STATUS_FAILED", "Failed to load payout status");
  }
}
