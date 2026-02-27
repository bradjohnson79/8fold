import { requireAdminV4 } from "@/src/auth/requireAdminV4";

export async function requireAdmin(req: Request): Promise<Response | Awaited<ReturnType<typeof requireAdminV4>>> {
  return await requireAdminV4(req);
}
