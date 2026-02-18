import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { releaseJobFunds } from "@/src/payouts/releaseJobFunds";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/release-funds
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

    const out = await releaseJobFunds({ jobId, triggeredByUserId: auth.userId });
    if (!out.ok) return NextResponse.json(out, { status: 409 });
    return NextResponse.json({ ok: true, data: out }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/[id]/release-funds", { userId: auth.userId });
  }
}

