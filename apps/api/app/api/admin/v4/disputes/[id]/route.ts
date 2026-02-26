import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const rows = await db.select().from(v4AdminDisputes).where(eq(v4AdminDisputes.id, id)).limit(1);
  const dispute = rows[0] ?? null;
  if (!dispute) return err(404, "ADMIN_V4_DISPUTE_NOT_FOUND", "Dispute not found");

  return ok({ dispute });
}
