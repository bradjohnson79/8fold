import { NextResponse } from "next/server";
import { handleApiError } from "@/src/lib/errorHandler";
import { releaseJobFunds } from "@/src/payouts/releaseJobFunds";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { eq } from "drizzle-orm";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { enforceTier, requireAdminIdentityWithTier } from "../../../_lib/adminTier";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/release
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

    const url = new URL(req.url);
    const dryRun = String(url.searchParams.get("dryRun") ?? "").toLowerCase() === "true";
    if (dryRun) {
      const jobRows = await db
        .select({
          id: jobs.id,
          amountCents: jobs.amountCents,
          paymentStatus: jobs.paymentStatus,
          payoutStatus: jobs.payoutStatus,
          fundedAt: jobs.fundedAt,
          releasedAt: jobs.releasedAt,
          status: jobs.status,
          contractorPayoutCents: jobs.contractorPayoutCents,
          routerEarningsCents: jobs.routerEarningsCents,
          brokerFeeCents: jobs.brokerFeeCents,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      return NextResponse.json(
        {
          ok: true,
          data: {
            preview: {
              action: "MANUAL_RELEASE",
              willMutate: false,
              willAttemptRelease: String(job.payoutStatus ?? "").toUpperCase() !== "RELEASED",
              escrowAmountCents: Number(job.amountCents ?? 0),
              payoutLegs: [
                { role: "CONTRACTOR", amountCents: Number(job.contractorPayoutCents ?? 0) },
                { role: "ROUTER", amountCents: Number(job.routerEarningsCents ?? 0) },
                { role: "PLATFORM_FEE", amountCents: Number(job.brokerFeeCents ?? 0) },
              ],
              current: {
                status: String(job.status ?? ""),
                paymentStatus: String(job.paymentStatus ?? ""),
                payoutStatus: String(job.payoutStatus ?? ""),
                fundedAt: job.fundedAt ? (job.fundedAt as Date).toISOString() : null,
                releasedAt: job.releasedAt ? (job.releasedAt as Date).toISOString() : null,
              },
              notes: ["Dry run does not mutate DB or call the release engine."],
            },
          },
        },
        { status: 200 },
      );
    }

    const out = await releaseJobFunds({ jobId, triggeredByUserId: identity.userId });
    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN" }, {
      action: "ADMIN_JOB_MANUAL_RELEASE",
      entityType: "Job",
      entityId: jobId,
      metadata: { ok: Boolean((out as any)?.ok), kind: (out as any).kind ?? null },
      outcome: (out as any)?.ok ? "OK" : "ERROR",
      error: (out as any)?.ok ? undefined : String((out as any)?.error ?? (out as any)?.kind ?? "release_failed"),
    });
    if (!out.ok) return NextResponse.json(out, { status: 409 });
    return NextResponse.json({ ok: true, data: out }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/[id]/release", { userId: identity.userId });
  }
}

