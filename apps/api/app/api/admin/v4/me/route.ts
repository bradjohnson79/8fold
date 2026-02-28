import { ok } from "@/src/lib/api/adminV4Response";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  return ok({
    admin: {
      id: authed.adminId,
      email: authed.email,
      role: authed.role,
    },
  });
}
