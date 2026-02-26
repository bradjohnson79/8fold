import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminJobs } from "@/db/schema/v4AdminJob";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const rows = await db.select().from(v4AdminJobs).where(eq(v4AdminJobs.id, id)).limit(1);
  const row = rows[0] ?? null;
  if (!row) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");
  return ok({ job: row });
}
