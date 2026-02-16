import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../../../db/drizzle";
import { jobDrafts } from "../../../db/schema/jobDraft";

export type JobDraftRow = typeof jobDrafts.$inferSelect;

export async function getDraftById(draftId: string): Promise<JobDraftRow | null> {
  const rows = await db.select().from(jobDrafts).where(eq(jobDrafts.id, draftId)).limit(1);
  return rows[0] ?? null;
}

export async function getDraftByUser(userId: string): Promise<JobDraftRow | null> {
  const rows = await db
    .select()
    .from(jobDrafts)
    .where(
      or(
        eq(jobDrafts.createdByAdminUserId, userId),
        eq(jobDrafts.createdByJobPosterUserId, userId),
      ),
    )
    .orderBy(desc(jobDrafts.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDraftsByUser(userId: string): Promise<JobDraftRow[]> {
  return await db
    .select()
    .from(jobDrafts)
    .where(
      or(
        eq(jobDrafts.createdByAdminUserId, userId),
        eq(jobDrafts.createdByJobPosterUserId, userId),
      ),
    )
    .orderBy(desc(jobDrafts.updatedAt));
}

