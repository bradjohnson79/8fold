import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminJobs } from "@/db/schema/v4AdminJob";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

function daysFromDateRange(v: string): number | null {
  const normalized = String(v).trim().toUpperCase();
  if (normalized === "1D") return 1;
  if (normalized === "7D") return 7;
  if (normalized === "30D") return 30;
  if (normalized === "90D") return 90;
  return null;
}

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") ?? "").trim();
  const country = String(searchParams.get("country") ?? "").trim();
  const province = String(searchParams.get("province") ?? searchParams.get("state") ?? "").trim();
  const trade = String(searchParams.get("trade") ?? searchParams.get("tradeCategory") ?? "").trim();
  const jobSource = String(searchParams.get("jobSource") ?? "").trim();
  const archived = String(searchParams.get("archived") ?? "").trim().toLowerCase();
  const q = String(searchParams.get("q") ?? "").trim();
  const dateRange = String(searchParams.get("dateRange") ?? searchParams.get("range") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? 100)));

  const where = [] as any[];
  if (status) where.push(eq(v4AdminJobs.status, status));
  if (country) where.push(eq(v4AdminJobs.country, country));
  if (province) where.push(eq(v4AdminJobs.province, province));
  if (trade) where.push(eq(v4AdminJobs.trade, trade));
  if (jobSource) where.push(eq(v4AdminJobs.jobSource, jobSource));
  if (archived === "true") where.push(eq(v4AdminJobs.archived, true));
  if (archived === "false") where.push(eq(v4AdminJobs.archived, false));
  if (q) {
    where.push(
      or(
        ilike(v4AdminJobs.id, `%${q}%`),
        ilike(v4AdminJobs.title, `%${q}%`),
        ilike(v4AdminJobs.address, `%${q}%`),
        ilike(v4AdminJobs.city, `%${q}%`),
      ),
    );
  }

  const days = daysFromDateRange(dateRange);
  if (days != null) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    where.push(and(gte(v4AdminJobs.createdAt, from), lte(v4AdminJobs.createdAt, new Date())));
  }

  try {
    const rows = await db
      .select()
      .from(v4AdminJobs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(v4AdminJobs.createdAt))
      .limit(limit);

    const jobs = rows.map((r) => ({
      id: r.id,
      status: r.status,
      title: r.title,
      country: r.country,
      province: r.province,
      regionCode: r.province,
      city: r.city,
      address: r.address,
      addressFull: r.address,
      trade: r.trade,
      tradeCategory: r.trade,
      jobSource: r.jobSource,
      routingStatus: r.routingStatus,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      archived: r.archived,
      amountCents: Number(r.amountCents ?? 0),
      paymentStatus: r.paymentStatus,
      payoutStatus: r.payoutStatus,
      assignment: r.assignmentId
        ? {
            id: r.assignmentId,
            status: r.assignmentStatus ?? "UNKNOWN",
            contractor: r.assignmentContractorId
              ? {
                  id: r.assignmentContractorId,
                  businessName: r.assignmentContractorName,
                  email: r.assignmentContractorEmail,
                }
              : null,
          }
        : null,
    }));

    return ok({ jobs });
  } catch (error) {
    console.error("[ADMIN_V4_JOBS_FALLBACK]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return ok({ jobs: [] as Array<Record<string, unknown>> });
  }
}
