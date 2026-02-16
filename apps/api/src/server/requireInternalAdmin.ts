import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "../../db/schema/adminUser";

const AdminIdSchema = z.string().uuid();

function getInternalSecret(): string | null {
  const s = process.env.INTERNAL_SECRET;
  return s && s.trim().length > 0 ? s.trim() : null;
}

export function requireInternalAdmin(req: Request): { adminId: string } | false {
  try {
    const expected = getInternalSecret();
    if (!expected) return false;

    const provided = String(req.headers.get("x-internal-secret") ?? "").trim();
    if (!provided || provided !== expected) return false;

    const rawAdminId = String(req.headers.get("x-admin-id") ?? "").trim();
    const parsed = AdminIdSchema.safeParse(rawAdminId);
    if (!parsed.success) return false;

    // Optional hardening: validate admin exists + role is admin-ish.
    // Never throw; any failure returns false.
    // NOTE: This is sync signature; the DB check is done by rbac wrapper (async).
    return { adminId: parsed.data };
  } catch {
    return false;
  }
}

export async function verifyInternalAdmin(req: Request): Promise<{ adminId: string } | false> {
  const base = requireInternalAdmin(req);
  if (!base) return false;

  try {
    const rows = await db
      .select({ id: adminUsers.id, role: adminUsers.role })
      .from(adminUsers)
      .where(eq(adminUsers.id, base.adminId))
      .limit(1);
    const admin = rows[0] ?? null;
    if (!admin) return false;
    const role = String(admin.role ?? "").trim().toUpperCase();
    if (role !== "ADMIN") return false;
    return { adminId: admin.id };
  } catch {
    return false;
  }
}

