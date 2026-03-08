import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { v4Reviews } from "@/db/schema/v4Review";
import { requireAdmin } from "@/src/adminBus";
import { ok, err } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  try {
    const rows = await db
      .select({
        id: v4Reviews.id,
        jobId: v4Reviews.jobId,
        jobTitle: jobs.title,
        jobPosterUserId: v4Reviews.jobPosterUserId,
        posterName: users.name,
        posterEmail: users.email,
        rating: v4Reviews.rating,
        comment: v4Reviews.comment,
        createdAt: v4Reviews.createdAt,
      })
      .from(v4Reviews)
      .innerJoin(jobs, eq(jobs.id, v4Reviews.jobId))
      .leftJoin(users, eq(users.id, v4Reviews.jobPosterUserId))
      .orderBy(sql`${v4Reviews.createdAt} DESC`)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(v4Reviews);

    return ok({
      reviews: rows.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        posterName: r.posterName || r.posterEmail || "Unknown",
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      total: Number(countRows[0]?.count ?? 0),
      page,
      pageSize,
    });
  } catch (e) {
    console.error("[admin-reviews]", e);
    return err("REVIEWS_FETCH_FAILED", "Failed to fetch reviews", 500);
  }
}
