import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";
import { jobDispatches } from "../../../../../db/schema/jobDispatch";
import { contractors } from "../../../../../db/schema/contractor";
import { users } from "../../../../../db/schema/user";
import { requireContractorReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";

export async function GET(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, u.userId)).limit(1);
    const email = String(userRows[0]?.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: true, hasContractor: false, offers: [] });
    }

    const contractorRows = await db
      .select({ id: contractors.id, businessName: contractors.businessName })
      .from(contractors)
      .where(eq(contractors.email, email))
      .limit(1);
    const contractor = contractorRows[0] ?? null;
    if (!contractor) {
      return NextResponse.json({ ok: true, hasContractor: false, offers: [] });
    }

    const now = new Date();
    const rows = await db
      .select({
        dispatchId: jobDispatches.id,
        dispatchStatus: jobDispatches.status,
        expiresAt: jobDispatches.expiresAt,
        createdAt: jobDispatches.createdAt,
        job: {
          id: jobs.id,
          title: jobs.title,
          region: jobs.region,
          tradeCategory: jobs.tradeCategory,
          status: jobs.status,
          availability: jobs.availability,
        },
      })
      .from(jobDispatches)
      .innerJoin(jobs, eq(jobDispatches.jobId, jobs.id))
      .where(and(eq(jobDispatches.contractorId, contractor.id), eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} > ${now}`))
      .orderBy(desc(jobDispatches.createdAt))
      .limit(50);

    const offers = rows.map((r) => ({
      dispatchId: r.dispatchId,
      status: r.dispatchStatus,
      expiresAt: r.expiresAt instanceof Date ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      job: {
        id: r.job.id,
        title: r.job.title,
        region: r.job.region,
        tradeCategory: r.job.tradeCategory,
        status: r.job.status,
        availability: r.job.availability,
      },
    }));

    return NextResponse.json({ ok: true, hasContractor: true, contractor: { id: contractor.id, businessName: contractor.businessName }, offers });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

