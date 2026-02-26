import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminSupportTickets } from "@/db/schema/v4AdminSupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("take") ?? searchParams.get("limit") ?? 100)));

  const rows = await db
    .select()
    .from(v4AdminSupportTickets)
    .where(status ? and(eq(v4AdminSupportTickets.status, status)) : undefined)
    .orderBy(desc(v4AdminSupportTickets.updatedAt))
    .limit(limit);

  return ok({ tickets: rows });
}
