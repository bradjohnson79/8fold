import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { refundJobFunds } from "@/src/services/refundJobFunds";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { logEvent } from "@/src/server/observability/log";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/refund
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const jobId = getIdFromUrl(req);
  if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

  try {
    const result = await refundJobFunds(jobId);
    if (result.kind === "ok") {
      logEvent({
        level: "info",
        event: "admin.job_refund",
        route: "/api/admin/jobs/[id]/refund",
        method: "POST",
        status: 200,
        userId: auth.userId,
        code: "STRIPE_REFUND",
        context: { jobId, refundId: result.refundId },
      });
    }

    await adminAuditLog(req, auth, {
      action: "ADMIN_JOB_REFUND",
      entityType: "Job",
      entityId: jobId,
      metadata: {
        kind: result.kind,
        refundId: (result as any).refundId ?? null,
        status: (result as any).status ?? null,
      },
      outcome: result.kind === "ok" || result.kind === "already_refunded" ? "OK" : "ERROR",
      error:
        result.kind === "ok" || result.kind === "already_refunded"
          ? undefined
          : String((result as any).kind ?? "refund_failed"),
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (result.kind === "already_refunded") return NextResponse.json({ ok: true, data: { alreadyRefunded: true } }, { status: 200 });
    if (result.kind === "refund_after_release") {
      return NextResponse.json({ ok: false, error: "Cannot refund after payout release" }, { status: 409 });
    }
    if (result.kind === "disputed") {
      return NextResponse.json({ ok: false, error: "Cannot refund while job is disputed. Resolve the dispute first." }, { status: 409 });
    }
    if (result.kind === "not_funded") return NextResponse.json({ ok: false, error: "Job not funded" }, { status: 409 });
    if (result.kind === "missing_stripe_ref") return NextResponse.json({ ok: false, error: "Missing Stripe reference" }, { status: 409 });
    if (result.kind === "bad_amount") return NextResponse.json({ ok: false, error: "Invalid job amount" }, { status: 400 });

    return NextResponse.json({ ok: true, data: { refundId: result.refundId, status: result.status } }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/refund", { route: "/api/admin/jobs/[id]/refund", userId: auth.userId });
  }
}

