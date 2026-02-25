import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4PmRequests } from "@/db/schema/v4PmRequest";
import { v4PmRequestItems } from "@/db/schema/v4PmRequestItem";
import { jobs } from "@/db/schema/job";

export type PmRequestSummary = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  contractorUserId: string;
  jobPosterUserId: string;
  status: string;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  items: { description: string; qty: number; url: string | null; unitPrice: string; lineTotal: string }[];
};

export async function listPmRequestsForJobPoster(userId: string): Promise<PmRequestSummary[]> {
  const rows = await db
    .select({
      id: v4PmRequests.id,
      jobId: v4PmRequests.jobId,
      contractorUserId: v4PmRequests.contractorUserId,
      jobPosterUserId: v4PmRequests.jobPosterUserId,
      status: v4PmRequests.status,
      subtotal: v4PmRequests.subtotal,
      tax: v4PmRequests.tax,
      total: v4PmRequests.total,
      createdAt: v4PmRequests.createdAt,
      jobTitle: jobs.title,
    })
    .from(v4PmRequests)
    .innerJoin(jobs, eq(jobs.id, v4PmRequests.jobId))
    .where(eq(v4PmRequests.jobPosterUserId, userId))
    .orderBy(desc(v4PmRequests.createdAt));

  const result: PmRequestSummary[] = [];
  for (const r of rows) {
    const items = await db
      .select({
        description: v4PmRequestItems.description,
        qty: v4PmRequestItems.qty,
        url: v4PmRequestItems.url,
        unitPrice: v4PmRequestItems.unitPrice,
        lineTotal: v4PmRequestItems.lineTotal,
      })
      .from(v4PmRequestItems)
      .where(eq(v4PmRequestItems.pmRequestId, r.id));

    result.push({
      id: r.id,
      jobId: r.jobId,
      jobTitle: r.jobTitle ?? null,
      contractorUserId: r.contractorUserId,
      jobPosterUserId: r.jobPosterUserId,
      status: r.status,
      subtotal: String(r.subtotal ?? "0"),
      tax: String(r.tax ?? "0"),
      total: String(r.total ?? "0"),
      createdAt: r.createdAt.toISOString(),
      items: items.map((i) => ({
        description: i.description,
        qty: i.qty,
        url: i.url,
        unitPrice: String(i.unitPrice ?? "0"),
        lineTotal: String(i.lineTotal ?? "0"),
      })),
    });
  }
  return result;
}

export async function approvePmRequest(pmRequestId: string, jobPosterUserId: string): Promise<{ ok: boolean }> {
  const rows = await db
    .select({ id: v4PmRequests.id, status: v4PmRequests.status, jobPosterUserId: v4PmRequests.jobPosterUserId })
    .from(v4PmRequests)
    .where(eq(v4PmRequests.id, pmRequestId))
    .limit(1);

  const r = rows[0];
  if (!r || r.jobPosterUserId !== jobPosterUserId) {
    throw new Error("P&M request not found or access denied");
  }
  if (r.status !== "PENDING") {
    throw new Error("P&M request is not pending");
  }

  await db
    .update(v4PmRequests)
    .set({ status: "APPROVED" })
    .where(eq(v4PmRequests.id, pmRequestId));

  return { ok: true };
}

export async function rejectPmRequest(pmRequestId: string, jobPosterUserId: string): Promise<{ ok: boolean }> {
  const rows = await db
    .select({ id: v4PmRequests.id, status: v4PmRequests.status, jobPosterUserId: v4PmRequests.jobPosterUserId })
    .from(v4PmRequests)
    .where(eq(v4PmRequests.id, pmRequestId))
    .limit(1);

  const r = rows[0];
  if (!r || r.jobPosterUserId !== jobPosterUserId) {
    throw new Error("P&M request not found or access denied");
  }
  if (r.status !== "PENDING") {
    throw new Error("P&M request is not pending");
  }

  await db
    .update(v4PmRequests)
    .set({ status: "REJECTED" })
    .where(eq(v4PmRequests.id, pmRequestId));

  return { ok: true };
}
