import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobPosters, users } from "../../../../../db/schema";

const QuerySchema = z.object({
  cursor: z.string().trim().min(1).optional()
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = 50;
    const cursorUserId = parsed.data.cursor ?? null;
    const cursorRow = cursorUserId
      ? (
          await db
            .select({ createdAt: jobPosters.createdAt, userId: jobPosters.userId })
            .from(jobPosters)
            .where(eq(jobPosters.userId, cursorUserId))
            .limit(1)
        )[0] ?? null
      : null;

    const cursorWhere = cursorRow
      ? or(
          lt(jobPosters.createdAt, cursorRow.createdAt),
          and(eq(jobPosters.createdAt, cursorRow.createdAt), lt(jobPosters.userId, cursorRow.userId)),
        )
      : undefined;

    const rows = await db
      .select({
        jobPoster: {
          userId: jobPosters.userId,
          defaultRegion: jobPosters.defaultRegion,
          totalJobsPosted: jobPosters.totalJobsPosted,
          lastJobPostedAt: jobPosters.lastJobPostedAt,
          createdAt: jobPosters.createdAt,
        },
        user: {
          email: users.email,
          phone: users.phone,
          name: users.name,
          role: users.role,
          status: users.status,
          country: users.country,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(jobPosters)
      .innerJoin(users, eq(users.id, jobPosters.userId))
      .where(cursorWhere as any)
      .orderBy(desc(jobPosters.createdAt), desc(jobPosters.userId))
      .limit(take + 1);

    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? rows[take]?.jobPoster?.userId ?? null : null;

    return NextResponse.json({
      ok: true,
      data: {
        jobPosters: page.map((r: any) => ({
        ...r.jobPoster,
        createdAt: (r.jobPoster.createdAt as any)?.toISOString?.() ?? String(r.jobPoster.createdAt),
        lastJobPostedAt: (r.jobPoster.lastJobPostedAt as any)?.toISOString?.() ?? null,
        user: {
          ...r.user,
          createdAt: (r.user.createdAt as any)?.toISOString?.() ?? String(r.user.createdAt),
          updatedAt: (r.user.updatedAt as any)?.toISOString?.() ?? String(r.user.updatedAt),
        },
      })),
        nextCursor,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/job-posters", { userId: auth.userId });
  }
}

