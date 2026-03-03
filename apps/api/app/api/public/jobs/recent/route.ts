import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, inArray } from "drizzle-orm";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok, badRequest } from "../../../../../src/lib/api/respond";
import { countEligiblePublicJobs, listNewestJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { db } from "@/server/db/drizzle";
import { jobPhotos } from "../../../../../db/schema/jobPhoto";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : 9;
      if (!Number.isFinite(n)) return 9;
      return Math.max(1, Math.min(50, Math.trunc(n)));
    }),
  debug: z.string().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  try {
    const parsed = QuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      debug: url.searchParams.get("debug") ?? undefined,
    });
    if (!parsed.success) return badRequest("invalid_query");

    const { limit } = parsed.data;

    const jobRows = await listNewestJobs(limit);
    if (process.env.NODE_ENV === "production") {
      const eligibleCount = await countEligiblePublicJobs();
      // eslint-disable-next-line no-console
      console.info(`[public/jobs/recent] eligible=${eligibleCount} returned=${jobRows.length} limit=${limit}`);
    }
    const ids = jobRows.map((j) => j.id).filter(Boolean) as string[];

    const photosByJobId = new Map<string, Array<{ id: string; kind: string; url: string | null }>>();
    if (ids.length) {
      try {
        const rows = await db
          .select({ jobId: jobPhotos.jobId, id: jobPhotos.id, kind: jobPhotos.kind, url: jobPhotos.url })
          .from(jobPhotos)
          .where(inArray(jobPhotos.jobId, ids))
          .orderBy(asc(jobPhotos.createdAt));
        for (const r of rows) {
          const arr = photosByJobId.get(r.jobId) ?? [];
          arr.push({ id: r.id, kind: r.kind, url: (r as { url?: string | null }).url ?? null });
          photosByJobId.set(r.jobId, arr);
        }
      } catch {
        // job_photos table may not exist in some DBs; return jobs with empty photos
      }
    }

    const out = jobRows.map((j) => {
      const createdAt = j.created_at instanceof Date ? j.created_at : j.created_at ? new Date(String(j.created_at)) : null;
      const amountCents = Number(j.amount_cents ?? 0);
      const currency = String(j.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD";
      return {
        id: String(j.id ?? ""),
        title: String(j.title ?? ""),
        tradeCategory: String(j.trade_category ?? ""),
        region: String(j.region ?? ""),
        city: j.city != null ? String(j.city) : null,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : "",
        amountCents,
        currency,
        status: "PUBLISHED",
        publicStatus: "OPEN" as const,
        serviceType: "handyman",
        country: "US" as const,
        laborTotalCents: amountCents,
        contractorPayoutCents: 0,
        routerEarningsCents: 0,
        brokerFeeCents: 0,
        materialsTotalCents: 0,
        transactionFeeCents: 0,
        photos: photosByJobId.get(j.id) ?? [],
      };
    });

    return ok({ jobs: out });
  } catch (err) {
    if (debug) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      return NextResponse.json(
        { ok: false, error: msg, code: "internal_error", debug: { message: msg, stack } },
        { status: 500 },
      );
    }
    return handleApiError(err, "GET /api/public/jobs/recent", { route: "/api/public/jobs/recent" });
  }
}
