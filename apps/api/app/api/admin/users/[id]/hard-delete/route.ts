import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { eq, or, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { users } from "../../../../../../db/schema/user";
import { jobs } from "../../../../../../db/schema/job";
import { jobPosters, routers, contractorAccounts } from "../../../../../../db/schema";
import { logEvent } from "@/src/server/observability/log";

function getAuthDbSchema(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    const jobCount = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(or(eq(jobs.job_poster_user_id, id), eq(jobs.contractor_user_id, id)))
      .limit(1);

    if (jobCount.length > 0) {
      return NextResponse.json(
        { ok: false, error: "user_has_historical_jobs" },
        { status: 400 }
      );
    }

    const authSchema = getAuthDbSchema();
    const sessionT = sql.raw(`"${authSchema}"."Session"`);
    const authTokenT = sql.raw(`"${authSchema}"."AuthToken"`);

    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from ${authTokenT} where "userId" = ${id}`);
      await tx.execute(sql`delete from ${sessionT} where "userId" = ${id}`);
      await tx.delete(jobPosters).where(eq(jobPosters.userId, id));
      await tx.delete(routers).where(eq(routers.userId, id));
      await tx.delete(contractorAccounts).where(eq(contractorAccounts.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });

    logEvent({
      level: "info",
      event: "admin.user_action",
      route: "/api/admin/users/[id]/hard-delete",
      method: "DELETE",
      status: 200,
      userId: auth.userId,
      code: "ADMIN_USER_HARD_DELETE",
      context: { targetUserId: id },
    });

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/users/[id]/hard-delete", { userId: auth.userId });
  }
}
