import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const role = String(searchParams.get("role") ?? "").trim();
  const q = String(searchParams.get("q") ?? searchParams.get("query") ?? "").trim();
  const country = String(searchParams.get("country") ?? "").trim();
  const province = String(searchParams.get("province") ?? searchParams.get("state") ?? searchParams.get("region") ?? "").trim();
  const city = String(searchParams.get("city") ?? "").trim();
  const status = String(searchParams.get("status") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? 100)));

  const where = [] as any[];
  if (role) where.push(eq(v4AdminUsers.role, role));
  if (status) where.push(eq(v4AdminUsers.status, status));
  if (country) where.push(eq(v4AdminUsers.country, country));
  if (province) where.push(eq(v4AdminUsers.state, province));
  if (city) where.push(eq(v4AdminUsers.city, city));
  if (q) {
    where.push(
      or(
        ilike(v4AdminUsers.email, `%${q}%`),
        ilike(v4AdminUsers.name, `%${q}%`),
      ),
    );
  }

  const rows = await db
    .select()
    .from(v4AdminUsers)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(v4AdminUsers.createdAt))
    .limit(limit);

  const users = rows.map((r) => ({
    id: r.id,
    name: r.name,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    role: r.role,
    country: r.country,
    state: r.state,
    city: r.city,
    createdAt: r.createdAt,
    status: r.status,
    suspendedUntil: r.suspendedUntil,
    archivedAt: r.archivedAt,
  }));

  return ok({ users, nextCursor: null });
}
