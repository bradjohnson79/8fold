import { z } from "zod";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { listNewestJobsByRegion } from "../../../../../src/server/repos/jobPublicRepo.drizzle";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  country: z.enum(["US", "CA"]),
  regionCode: z.string().trim().min(2).max(3),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(9).default(9),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      country: url.searchParams.get("country"),
      regionCode: url.searchParams.get("regionCode"),
      page: url.searchParams.get("page") ?? 1,
      limit: url.searchParams.get("limit") ?? 9,
    });

    if (!parsed.success) return badRequest("invalid_query");
    const { country, regionCode, page, limit } = parsed.data;

    const { rows, totalJobs, totalPages } = await listNewestJobsByRegion(country, regionCode, page, limit);

    const jobs = rows.map((j) => {
      const createdAt =
        j.created_at instanceof Date ? j.created_at : j.created_at ? new Date(String(j.created_at)) : null;
      const amountCents = Number(j.amount_cents ?? 0);
      const currency = String(j.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD";

      return {
        id: String(j.id ?? ""),
        title: String(j.title ?? ""),
        tradeCategory: String(j.trade_category ?? "handyman"),
        city: j.city ? String(j.city) : null,
        status: String(j.status ?? "OPEN_FOR_ROUTING"),
        amountCents,
        currency,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : "",
        imageUrl:
          Array.isArray(j.photo_urls) && j.photo_urls.length > 0 ? String(j.photo_urls[0]) : null,
        contractorPayoutCents: Number(j.contractor_payout_cents ?? 0),
        routerEarningsCents: Number(j.router_earnings_cents ?? 0),
        brokerFeeCents: Number(j.broker_fee_cents ?? 0),
      };
    });

    return ok({ jobs, page, limit, totalJobs, totalPages });
  } catch (err) {
    return handleApiError(err, "GET /api/public/jobs/by-region");
  }
}
