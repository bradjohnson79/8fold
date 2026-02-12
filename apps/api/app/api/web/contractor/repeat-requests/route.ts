import { NextResponse } from "next/server";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { contractors, jobs, repeatContractorRequests, users } from "../../../../../db/schema";

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user =
      (
        await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, u.userId))
          .limit(1)
      )[0] ?? null;
    const email = (user?.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ requests: [] });

    // Contractors are matched by email to the inventory Contractor record.
    const contractor =
      (
        await db
          .select({
            id: contractors.id,
            businessName: contractors.businessName,
            trade: contractors.trade,
            regionCode: contractors.regionCode,
          })
          .from(contractors)
          .where(and(ilike(contractors.email, email), eq(contractors.status, "APPROVED")))
          .limit(1)
      )[0] ?? null;
    if (!contractor) return NextResponse.json({ requests: [] });

    const rows = await db
      .select({
        id: repeatContractorRequests.id,
        status: repeatContractorRequests.status,
        requestedAt: repeatContractorRequests.requestedAt,
        tradeCategory: repeatContractorRequests.tradeCategory,
        priorJobId: repeatContractorRequests.priorJobId,
        job: {
          id: jobs.id,
          title: jobs.title,
          city: jobs.city,
          regionCode: jobs.regionCode,
          status: jobs.status,
          laborTotalCents: jobs.laborTotalCents,
        },
      })
      .from(repeatContractorRequests)
      .innerJoin(jobs, eq(jobs.id, repeatContractorRequests.jobId))
      .where(and(eq(repeatContractorRequests.contractorId, contractor.id), eq(repeatContractorRequests.status, "REQUESTED")))
      .orderBy(desc(repeatContractorRequests.requestedAt), desc(repeatContractorRequests.id))
      .limit(50);

    return NextResponse.json({
      contractor,
      requests: rows.map((r) => ({
        ...r,
        requestedAt: (r.requestedAt as any)?.toISOString?.() ?? String(r.requestedAt),
      }))
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

