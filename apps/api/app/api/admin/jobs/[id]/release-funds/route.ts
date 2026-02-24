import { NextResponse } from "next/server";
import { handleApiError } from "@/src/lib/errorHandler";
import { releaseJobFunds } from "@/src/payouts/releaseJobFunds";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { enforceTier, requireAdminIdentityWithTier } from "../../../_lib/adminTier";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/release-funds
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

    const out = await releaseJobFunds({ jobId, triggeredByUserId: identity.userId });
    await adminAuditLog(
      req,
      {
        userId: identity.userId,
        role: "ADMIN",
        authSource: identity.authSource,
      },
      {
        action: "ADMIN_JOB_MANUAL_RELEASE",
        entityType: "Job",
        entityId: jobId,
        metadata: { ok: Boolean((out as any)?.ok), kind: (out as any).kind ?? null },
        outcome: (out as any)?.ok ? "OK" : "ERROR",
        error: (out as any)?.ok ? undefined : String((out as any)?.error ?? (out as any)?.kind ?? "release_failed"),
      },
    );
    if (!out.ok) return NextResponse.json(out, { status: 409 });
    return NextResponse.json({ ok: true, data: out }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/[id]/release-funds", { userId: identity.userId });
  }
}

