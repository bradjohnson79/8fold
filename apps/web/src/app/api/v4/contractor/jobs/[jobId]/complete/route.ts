import { legacyRouteFrozen } from "@/lib/legacyFreeze";

export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ jobId: string }> }
) {
  return legacyRouteFrozen("/api/web/v4/contractor/jobs/{jobId}/mark-complete");
}
