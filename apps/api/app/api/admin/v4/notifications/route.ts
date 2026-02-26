import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4Notifications } from "@/db/schema/v4Notification";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const priority = String(searchParams.get("priority") ?? "").trim();
  const read = String(searchParams.get("read") ?? "").trim();

  const where = [or(eq(v4Notifications.userId, authed.adminId), eq(v4Notifications.role, "ADMIN"))] as any[];
  if (priority) where.push(eq(v4Notifications.priority, priority));
  if (read === "true") where.push(eq(v4Notifications.read, true));
  if (read === "false") where.push(eq(v4Notifications.read, false));

  const rows = await db
    .select()
    .from(v4Notifications)
    .where(and(...where))
    .orderBy(desc(v4Notifications.createdAt))
    .limit(200);

  return ok({ notifications: rows });
}
