import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { db } from "@/db/drizzle";
import { v4JobPriceAdjustments } from "@/db/schema/v4JobPriceAdjustment";
import { jobs } from "@/db/schema/job";
import { and, desc, eq, gt, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    const userId = role.userId;

    const now = new Date();

    // Fetch up to 3 adjustments that are awaiting the poster's decision and not yet expired.
    const rows = await db
      .select({
        id: v4JobPriceAdjustments.id,
        jobId: v4JobPriceAdjustments.jobId,
        requestedPriceCents: v4JobPriceAdjustments.requestedPriceCents,
        originalPriceCents: v4JobPriceAdjustments.originalPriceCents,
        secureToken: v4JobPriceAdjustments.secureToken,
        tokenExpiresAt: v4JobPriceAdjustments.tokenExpiresAt,
        createdAt: v4JobPriceAdjustments.createdAt,
        jobTitle: jobs.title,
        jobAmountCents: jobs.amount_cents,
        jobCity: jobs.city,
        jobRegion: jobs.region,
      })
      .from(v4JobPriceAdjustments)
      .innerJoin(jobs, eq(jobs.id, v4JobPriceAdjustments.jobId))
      .where(
        and(
          eq(v4JobPriceAdjustments.jobPosterUserId, userId),
          inArray(v4JobPriceAdjustments.status, ["SENT_TO_POSTER"] as any),
        ),
      )
      .orderBy(desc(v4JobPriceAdjustments.createdAt))
      .limit(3);

    const pendingAppraisals = rows.map((r) => {
      const originalCents =
        r.originalPriceCents ?? r.jobAmountCents ?? 0;
      const requestedCents = r.requestedPriceCents ?? 0;
      const additionalCents = Math.max(0, requestedCents - originalCents);

      const expired =
        r.tokenExpiresAt instanceof Date
          ? r.tokenExpiresAt.getTime() < now.getTime()
          : false;

      const city = r.jobCity ? String(r.jobCity).trim() : null;
      const region = r.jobRegion ? String(r.jobRegion).trim() : null;
      const location = [city, region].filter(Boolean).join(", ") || null;

      return {
        adjustmentId: r.id,
        jobId: r.jobId,
        jobTitle: r.jobTitle ?? "Untitled Job",
        originalPriceCents: originalCents,
        requestedPriceCents: requestedCents,
        additionalPriceCents: additionalCents,
        location,
        secureToken: r.secureToken ?? null,
        expiresAt: r.tokenExpiresAt instanceof Date ? r.tokenExpiresAt.toISOString() : null,
        expired,
      };
    });

    return NextResponse.json({ pendingAppraisals });
  } catch (err) {
    console.error("[POSTER_PENDING_APPRAISALS_ERROR]", err instanceof Error ? err.message : err);
    return NextResponse.json({ pendingAppraisals: [] }, { status: 200 });
  }
}
