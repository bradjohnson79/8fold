import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const rows = await db.select().from(v4AdminUsers).where(eq(v4AdminUsers.id, id)).limit(1);
  const user = rows[0] ?? null;
  if (!user) return err(404, "ADMIN_V4_USER_NOT_FOUND", "User not found");

  return ok({ user, jobPoster: null, router: null, contractorAccount: null });
}
