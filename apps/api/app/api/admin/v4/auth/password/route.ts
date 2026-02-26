import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { adminSessions } from "@/db/schema/adminSession";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { appendClearSessionCookie } from "@/src/auth/adminV4Session";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const BodySchema = z.object({ currentPassword: z.string().trim().min(1), newPassword: z.string().trim().min(8) });

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid password payload");

  const rows = await db.select({ id: v4AdminUsers.id, authSubjectId: v4AdminUsers.authSubjectId, passwordHash: v4AdminUsers.passwordHash }).from(v4AdminUsers).where(eq(v4AdminUsers.id, authed.adminId)).limit(1);
  const admin = rows[0] ?? null;
  if (!admin?.id || !admin.passwordHash || !admin.authSubjectId) return err(401, "ADMIN_V4_UNAUTHORIZED", "Admin not found");

  const valid = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash).catch(() => false);
  if (!valid) return err(401, "ADMIN_V4_UNAUTHORIZED", "Current password is incorrect");

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.update(v4AdminUsers).set({ passwordHash: nextHash }).where(eq(v4AdminUsers.id, admin.id));
  await db.delete(adminSessions).where(eq(adminSessions.adminUserId, admin.authSubjectId));

  const res = ok({ passwordUpdated: true });
  appendClearSessionCookie(res);
  return res;
}
