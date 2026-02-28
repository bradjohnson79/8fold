import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminPayoutRequests } from "@/db/schema/v4AdminPayoutRequest";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? 100)));

  const rows = await db
    .select()
    .from(v4AdminPayoutRequests)
    .where(status ? and(eq(v4AdminPayoutRequests.status, status)) : undefined)
    .orderBy(desc(v4AdminPayoutRequests.createdAt))
    .limit(limit);

  return ok({ payoutRequests: rows });
}
