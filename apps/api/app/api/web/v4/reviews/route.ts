import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4Reviews } from "@/db/schema/v4Review";
import { requireV4Role } from "@/src/auth/requireV4Role";

const randomUUID = () => globalThis.crypto.randomUUID();

export async function POST(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const body = (await req.json().catch(() => ({}))) as {
    jobId?: string;
    rating?: unknown;
    comment?: string;
  };

  const jobId = String(body.jobId ?? "").trim();
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });

  const rating = Number(body.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "Rating must be between 1 and 5" }, { status: 400 });
  }

  const comment = String(body.comment ?? "").trim();

  const jobRows = await db
    .select({ id: jobs.id, jobPosterUserId: jobs.job_poster_user_id, completedAt: jobs.completed_at })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0];
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (String(job.jobPosterUserId ?? "") !== role.userId) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }
  if (!job.completedAt) {
    return NextResponse.json({ ok: false, error: "Job must be completed before leaving a review" }, { status: 409 });
  }

  const existing = await db
    .select({ id: v4Reviews.id })
    .from(v4Reviews)
    .where(eq(v4Reviews.jobId, jobId))
    .limit(1);

  if (existing[0]) {
    return NextResponse.json({ ok: true, id: existing[0].id, idempotent: true });
  }

  const id = randomUUID();
  await db.insert(v4Reviews).values({
    id,
    jobId,
    jobPosterUserId: role.userId,
    rating: Math.round(rating),
    comment,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, id });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const rows = await db
    .select({
      id: v4Reviews.id,
      jobId: v4Reviews.jobId,
      jobPosterUserId: v4Reviews.jobPosterUserId,
      rating: v4Reviews.rating,
      comment: v4Reviews.comment,
      createdAt: v4Reviews.createdAt,
      jobTitle: jobs.title,
    })
    .from(v4Reviews)
    .innerJoin(jobs, eq(jobs.id, v4Reviews.jobId))
    .orderBy(sql`${v4Reviews.createdAt} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4Reviews);

  return NextResponse.json({
    reviews: rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      jobPosterUserId: r.jobPosterUserId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt?.toISOString() ?? null,
      jobTitle: r.jobTitle,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
}
