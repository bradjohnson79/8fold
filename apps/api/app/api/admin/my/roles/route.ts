import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { jobPosters } from "@/db/schema/jobPoster";
import { routers } from "@/db/schema/router";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = auth.userId;

    const [jp] = await db.select({ id: jobPosters.userId }).from(jobPosters).where(eq(jobPosters.userId, userId)).limit(1);
    const [r] = await db.select({ id: routers.userId }).from(routers).where(eq(routers.userId, userId)).limit(1);
    const [c] = await db.select({ id: contractorAccounts.userId }).from(contractorAccounts).where(eq(contractorAccounts.userId, userId)).limit(1);

    return NextResponse.json({
      ok: true,
      data: {
        roles: {
          isJobPoster: !!jp,
          isRouter: !!r,
          isContractor: !!c,
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/my/roles");
  }
}
