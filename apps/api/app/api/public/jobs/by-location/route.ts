import { z } from "zod";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { getRegionDatasets, type CountryCode2 } from "../../../../../src/locations/datasets";
import { listJobsByLocation } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { db } from "@/server/db/drizzle";
import { asc, inArray } from "drizzle-orm";
import { jobPhotos } from "../../../../../db/schema/jobPhoto";

const QuerySchema = z.object({
  country: z.enum(["US", "CA"]),
  regionCode: z.string().trim().min(2).max(2),
  city: z.string().trim().min(1).max(80)
});

function slugCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      country: url.searchParams.get("country"),
      regionCode: url.searchParams.get("regionCode"),
      city: url.searchParams.get("city")
    });
    if (!parsed.success) return badRequest("invalid_query");

    const { country: _countryHint, regionCode, city } = parsed.data;
    const regionCodeUp = regionCode.toUpperCase();
    const regionSlug = `${slugCity(city)}-${regionCodeUp.toLowerCase()}`;

    // Legacy-safe: treat regionCode as authoritative for country (older rows may have default country but correct regionCode).
    const datasets = getRegionDatasets();
    const countryByRegionCode = new Map<string, CountryCode2>();
    for (const ds of datasets) {
      for (const r of ds.regions) {
        countryByRegionCode.set(r.regionCode.toUpperCase(), ds.country);
      }
    }
    const canonicalCountry = countryByRegionCode.get(regionCodeUp) ?? "US";

    const jobRows = await listJobsByLocation({ country: canonicalCountry, regionCode: regionCodeUp, city });
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
      scope: j.scope,
      regionName: j.regionName,
      city: j.city,
      regionCode: j.regionCode,
      country: canonicalCountry,
      publicStatus: j.publicStatus,
      serviceType: j.serviceType,
      tradeCategory: j.tradeCategory,
      laborTotalCents: j.laborTotalCents,
      materialsTotalCents: j.materialsTotalCents,
      transactionFeeCents: j.transactionFeeCents,
      contractorPayoutCents: j.contractorPayoutCents,
      routerEarningsCents: j.routerEarningsCents,
      brokerFeeCents: j.brokerFeeCents,
      createdAt: j.createdAt,
      publishedAt: j.publishedAt,
      photos: photosByJobId.get(j.id) ?? [],
    }));

    const out = jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      publishedAt: j.publishedAt.toISOString()
    }));

    return ok({ jobs: out });
  } catch (err) {
    return handleApiError(err, "GET /api/public/jobs/by-location");
  }
}

