import { NextResponse } from "next/server";
import { requireJobPoster } from "@/src/auth/rbac";
import { submitJobFromActiveDraft } from "@/src/services/escrow/jobDraftSubmitService";

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const result = await submitJobFromActiveDraft(user.userId);
    return NextResponse.json({ success: true, jobId: result.jobId, created: result.created });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to submit draft." },
      { status },
    );
  }
}
