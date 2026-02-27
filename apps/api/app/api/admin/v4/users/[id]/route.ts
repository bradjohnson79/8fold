import { requireAdmin, usersRepo } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const user = await usersRepo.getUser(id);
  if (!user) return err(404, "ADMIN_V4_USER_NOT_FOUND", "User not found");

  return ok({ user, jobPoster: null, router: null, contractorAccount: null });
}
