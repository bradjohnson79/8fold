import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireContractorReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { db } from "../../../../../db/drizzle";
import { conversations } from "../../../../../db/schema/conversation";
import { jobs } from "../../../../../db/schema/job";

export async function GET(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const rows = await db
      .select({
        id: conversations.id,
        jobId: conversations.jobId,
        contractorUserId: conversations.contractorUserId,
        jobPosterUserId: conversations.jobPosterUserId,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,

        jobTitle: jobs.title,
        jobStatus: jobs.status,
      })
      .from(conversations)
      .innerJoin(jobs, eq(jobs.id, conversations.jobId))
      .where(eq(conversations.contractorUserId, u.userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    return NextResponse.json({ conversations: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString(), createdAt: r.createdAt.toISOString() })) });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

