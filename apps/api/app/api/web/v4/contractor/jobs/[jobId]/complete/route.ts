import { legacyRouteFrozen } from "@/src/lib/api/legacyFreeze";

export async function POST() {
  return legacyRouteFrozen("/api/web/v4/contractor/jobs/{jobId}/mark-complete");
}
