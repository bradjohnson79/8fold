import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminTransfers } from "@/db/schema/v4AdminTransfer";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const role = String(searchParams.get("role") ?? "").trim();
  const status = String(searchParams.get("status") ?? "").trim();
  const userId = String(searchParams.get("userId") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("take") ?? searchParams.get("limit") ?? 100)));

  const where = [] as any[];
  if (role) where.push(eq(v4AdminTransfers.role, role));
  if (status) where.push(eq(v4AdminTransfers.status, status));
  if (userId) where.push(eq(v4AdminTransfers.userId, userId));

  const rows = await db
    .select()
    .from(v4AdminTransfers)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(v4AdminTransfers.createdAt))
    .limit(limit);

  return ok({ items: rows });
}
