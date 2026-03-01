import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const path = new URL(req.url).pathname;
  console.info("[RUNTIME_PROBE]", {
    path,
    method: req.method,
    timestamp: Date.now(),
  });
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;
  return ok({ admin: { id: authed.adminId, email: authed.email, role: authed.role } });
}
