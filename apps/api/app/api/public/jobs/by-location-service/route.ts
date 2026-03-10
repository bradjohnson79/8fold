import { z } from "zod";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import {
  listJobsByLocationAndService,
  listDistinctServicesByCity,
} from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { slugToTradeCategory } from "../../../../../src/utils/slug";
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
  regionCode: z.string().trim().min(2).max(3),
  city: z.string().trim().min(1).max(80),
  service: z.string().trim().min(1).max(64),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(9).default(9),
});

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      country: url.searchParams.get("country"),
      regionCode: url.searchParams.get("regionCode"),
      city: url.searchParams.get("city"),
      service: url.searchParams.get("service"),
      page: url.searchParams.get("page") ?? 1,
      limit: url.searchParams.get("limit") ?? 9,
    });

    if (!parsed.success) return badRequest("invalid_query");

    const { country, regionCode, city, service, page, limit } = parsed.data;

    const tradeCategory = slugToTradeCategory(service);
    if (!tradeCategory) {
      return ok({ jobs: [], page, limit, totalJobs: 0, totalPages: 0 });
    }

    const regionCodeUp = regionCode.toUpperCase();

    const [{ rows, totalJobs, totalPages }, distinctServices] = await Promise.all([
      listJobsByLocationAndService({
        country,
        regionCode: regionCodeUp,
        city,
        tradeCategory,
        page,
        limit,
      }),
      listDistinctServicesByCity({ country, regionCode: regionCodeUp, city }),
    ]);

    const ids = rows.map((j) => j.id).filter(Boolean) as string[];

    const photosByJobId = new Map<string, Array<{ id: string; kind: string; url: string | null }>>();
    if (ids.length) {
      const photoRows = await db
        .select({ jobId: jobPhotos.jobId, id: jobPhotos.id, kind: jobPhotos.kind, url: jobPhotos.url })
        .from(jobPhotos)
        .where(inArray(jobPhotos.jobId, ids))
        .orderBy(asc(jobPhotos.createdAt));
      for (const r of photoRows) {
        const arr = photosByJobId.get(r.jobId) ?? [];
        arr.push({ id: r.id, kind: r.kind, url: (r as { url?: string | null }).url ?? null });
        photosByJobId.set(r.jobId, arr);
      }
    }

    const jobs = rows.map((j) => {
      const createdAt =
        j.created_at instanceof Date ? j.created_at : j.created_at ? new Date(String(j.created_at)) : null;
      const amountCents = Number(j.amount_cents ?? 0);
      const currency = String(j.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD";
      const photos = photosByJobId.get(j.id) ?? [];
      const photoUrls = Array.isArray(j.photo_urls) ? j.photo_urls : [];
      const imageUrl = deriveImageUrl(photoUrls, photos);

      return {
        id: String(j.id ?? ""),
        title: String(j.title ?? ""),
        tradeCategory: String(j.trade_category ?? "handyman"),
        city: j.city ? String(j.city) : null,
        status: String(j.status ?? "OPEN_FOR_ROUTING"),
        amountCents,
        currency,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : "",
        publishedAt: j.published_at instanceof Date ? j.published_at.toISOString() : (j.published_at ? String(j.published_at) : null),
        imageUrl: imageUrl ?? null,
        contractorPayoutCents: Number(j.contractor_payout_cents ?? 0),
        routerEarningsCents: Number(j.router_earnings_cents ?? 0),
        brokerFeeCents: Number(j.broker_fee_cents ?? 0),
        photos,
      };
    });

    return ok({ jobs, page, limit, totalJobs, totalPages, distinctServices });
  } catch (err) {
    return handleApiError(err, "GET /api/public/jobs/by-location-service");
  }
}
