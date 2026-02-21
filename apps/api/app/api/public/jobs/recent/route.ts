import { z } from "zod";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { countEligiblePublicJobs, listNewestJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { db } from "@/server/db/drizzle";
import { asc, inArray } from "drizzle-orm";
import { jobPhotos } from "../../../../../db/schema/jobPhoto";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : 9;
      if (!Number.isFinite(n)) return 9;
      return Math.max(1, Math.min(50, Math.trunc(n)));
    })
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined
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
      const rows = await db
        .select({ jobId: jobPhotos.jobId, id: jobPhotos.id, kind: jobPhotos.kind, url: jobPhotos.url })
        .from(jobPhotos)
        .where(inArray(jobPhotos.jobId, ids))
        .orderBy(asc(jobPhotos.createdAt));
      for (const r of rows) {
        const arr = photosByJobId.get(r.jobId) ?? [];
        arr.push({ id: r.id, kind: r.kind, url: (r as any).url ?? null });
        photosByJobId.set(r.jobId, arr);
      }
    }

    const jobs = jobRows.map((j) => ({
      id: j.id,
      status: j.status,
      title: j.title,
      region: j.region,
      city: j.city,
      country: j.country,
      publicStatus: j.publicStatus,
      tradeCategory: j.tradeCategory,
      serviceType: "handyman",
      laborTotalCents: j.laborTotalCents,
      contractorPayoutCents: j.contractorPayoutCents,
      routerEarningsCents: j.routerEarningsCents,
      brokerFeeCents: j.brokerFeeCents,
      materialsTotalCents: j.materialsTotalCents,
      transactionFeeCents: j.transactionFeeCents,
      createdAt: j.createdAt,
      photos: photosByJobId.get(j.id) ?? [],
    }));

    const out = jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
    }));

    return ok({ jobs: out });
  } catch (err) {
    return handleApiError(err, "GET /api/public/jobs/recent");
  }
}

