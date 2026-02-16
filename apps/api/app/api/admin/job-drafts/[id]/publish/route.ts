import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { assertJobDraftTransition } from "../../../../../../src/jobs/jobDraftTransitions";
import { generateActionToken, hashActionToken } from "../../../../../../src/jobs/actionTokens";
import { currencyForCountry } from "@8fold/shared";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobDrafts } from "../../../../../../db/schema/jobDraft";
import { jobs } from "../../../../../../db/schema/job";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../job-drafts/:id/publish
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const CA_PROVINCES_ONLY = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"]);
    function countryFromRegion(region: string): "US" | "CA" {
      const parts = String(region ?? "").split("-").filter(Boolean);
      const code = String(parts[parts.length - 1] ?? "").toUpperCase();
      if (CA_PROVINCES_ONLY.has(code)) return "CA";
      return "US";
    }

    const result = await db.transaction(async (tx: any) => {
      const currentRows = await tx.select().from(jobDrafts).where(eq(jobDrafts.id, id)).limit(1);
      const current = currentRows[0] ?? null;
      if (!current) return { kind: "not_found" as const };

      if ((current as any).publishedJobId) {
        return { kind: "already_published" as const, jobDraftId: (current as any).id };
      }

      assertJobDraftTransition((current as any).status, "APPROVED");

      const customerToken = generateActionToken();
      const customerTokenHash = hashActionToken(customerToken);
      const country2 = countryFromRegion((current as any).region);
      const currency = currencyForCountry(country2);
      const now = new Date();

      const createdJobRows = await tx
        .insert(jobs)
        .values({
          id: crypto.randomUUID(),
          status: "PUBLISHED",
          jobSource: "REAL",
          isMock: false,
          title: (current as any).title,
          scope: (current as any).scope,
          region: (current as any).region,
          country: country2,
          currency,
          serviceType: (current as any).serviceType,
          tradeCategory: ((current as any).tradeCategory ?? "HANDYMAN") as any,
          jobType: (current as any).jobType,
          lat: (current as any).lat,
          lng: (current as any).lng,
          timeWindow: (current as any).timeWindow,
          routerEarningsCents: (current as any).routerEarningsCents,
          brokerFeeCents: (current as any).brokerFeeCents,
          contractorPayoutCents: (current as any).contractorPayoutCents,
          laborTotalCents: (current as any).laborTotalCents,
          materialsTotalCents: (current as any).materialsTotalCents,
          transactionFeeCents: (current as any).transactionFeeCents,
          publishedAt: now,
          customerActionTokenHash: customerTokenHash,
        } as any)
        .returning();
      const job = createdJobRows[0] as any;

      const updatedDraftRows = await tx
        .update(jobDrafts)
        .set({ status: "APPROVED", publishedJobId: job.id, updatedAt: now } as any)
        .where(eq(jobDrafts.id, id))
        .returning();
      const jobDraft = updatedDraftRows[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "JOB_DRAFT_PUBLISH",
        entityType: "JobDraft",
        entityId: jobDraft.id,
        metadata: { toJobId: job.id, from: (current as any).status, to: jobDraft.status } as any,
      });

      return { kind: "ok" as const, jobDraft, job, customerToken };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (result.kind === "already_published") {
      return NextResponse.json(
        { ok: false, error: "JobDraft already published" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, data: { jobDraft: result.jobDraft, job: result.job, customerToken: result.customerToken } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/job-drafts/:id/publish", { route: "/api/admin/job-drafts/[id]/publish", userId: auth.userId });
  }
}

