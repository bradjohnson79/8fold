import { z } from "zod";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { listHomepagePreviewJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";

const QuerySchema = z.object({
  city: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(6).default(6),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      city: url.searchParams.get("city"),
      limit: url.searchParams.get("limit") ?? 6,
    });

    if (!parsed.success) return badRequest("invalid_query");

    const { city, limit } = parsed.data;
    const rows = await listHomepagePreviewJobs({ city, limit });

    const jobs = rows.map((job) => ({
      id: String(job.id ?? ""),
      title: String(job.title ?? ""),
      tradeCategory: job.trade_category ? String(job.trade_category) : null,
      city: job.city ? String(job.city) : city,
      amountCents: Number(job.amount_cents ?? 0),
      currency: String(job.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD",
      budgetLowCents: Number(job.ai_price_range_low ?? 0),
      budgetHighCents: Number(job.ai_price_range_high ?? 0),
      status: String(job.status ?? "IN_PROGRESS"),
      createdAt:
        job.created_at instanceof Date
          ? job.created_at.toISOString()
          : job.created_at
            ? new Date(String(job.created_at)).toISOString()
            : "",
    }));

    return ok({ jobs });
  } catch (err) {
    return handleApiError(err, "GET /api/public/jobs/homepage-preview");
  }
}
