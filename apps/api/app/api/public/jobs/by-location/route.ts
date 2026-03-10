import { z } from "zod";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { getRegionDatasets, type CountryCode2 } from "../../../../../src/locations/datasets";
import { listJobsByLocation, listDistinctServicesByCity } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { db } from "@/server/db/drizzle";
import { asc, inArray } from "drizzle-orm";
import { jobPhotos } from "../../../../../db/schema/jobPhoto";

function deriveImageUrl(
  photoUrls: string[] | null,
  photosFromTable: Array<{ url: string | null }>,
): string | null {
  const fromJob = Array.isArray(photoUrls) && photoUrls.length > 0 ? photoUrls[0] : null;
  if (fromJob) return fromJob;
  const fromTable = photosFromTable.find((p) => p.url)?.url ?? null;
  return fromTable ?? null;
}

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

    const [jobRows, distinctServices] = await Promise.all([
      listJobsByLocation({ country: canonicalCountry, regionCode: regionCodeUp, city }),
      listDistinctServicesByCity({ country: canonicalCountry, regionCode: regionCodeUp, city }),
    ]);
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
        arr.push({ id: r.id, kind: r.kind, url: (r as { url?: string | null }).url ?? null });
        photosByJobId.set(r.jobId, arr);
      }
    }

    const out = jobRows.map((j) => {
      const createdAt = j.created_at instanceof Date ? j.created_at : j.created_at ? new Date(String(j.created_at)) : null;
      const amountCents = Number(j.amount_cents ?? 0);
      const currency = String(j.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD";
      const photos = photosByJobId.get(j.id) ?? [];
      const photoUrls = Array.isArray(j.photo_urls) ? j.photo_urls : [];
      const imageUrl = deriveImageUrl(photoUrls, photos);
      const routerCents = Number(j.router_earnings_cents ?? 0);
      const contractorCents = Number(j.contractor_payout_cents ?? 0);
      const brokerCents = Number(j.broker_fee_cents ?? 0);
      return {
        id: String(j.id ?? ""),
        title: String(j.title ?? ""),
        tradeCategory: String(j.trade_category ?? "handyman"),
        region: String(j.region_name ?? j.region ?? ""),
        regionName: j.region_name != null ? String(j.region_name) : null,
        city: j.city != null ? String(j.city) : null,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : "",
        amountCents,
        currency,
        regionCode,
        country: canonicalCountry,
        status: String(j.status ?? "OPEN_FOR_ROUTING"),
        publicStatus: "OPEN" as const,
        serviceType: "handyman",
        laborTotalCents: amountCents,
        materialsTotalCents: 0,
        transactionFeeCents: 0,
        contractorPayoutCents: contractorCents,
        routerEarningsCents: routerCents,
        brokerFeeCents: brokerCents,
        imageUrl: imageUrl ?? undefined,
        photos,
      };
    });

    return ok({
      jobs: out,
      distinctServices: distinctServices.map((s) => ({ tradeCategory: s.tradeCategory })),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/public/jobs/by-location");
  }
}

