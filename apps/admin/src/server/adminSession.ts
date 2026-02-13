import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "../../../api/db/drizzle";
import { sql } from "drizzle-orm";

export type AdminSession = {
  adminUser: { id: string; email: string; role: string };
  actorUser: { id: string }; // Canonical User.id used for authored records
};

const COOKIE_NAME = "admin_session";

export async function getAdminSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function requireAdminSession(): Promise<AdminSession> {
  const id = await getAdminSessionCookie();
  if (!id) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const adminRes = await db.execute(sql`
    select "id", "email", "role"
    from "AdminUser"
    where "id" = ${id}
    limit 1
  `);
  const adminUser = (adminRes.rows[0] ?? null) as { id: string; email: string; role: string } | null;
  if (!adminUser) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const adminRole = String(adminUser.role ?? "").trim().toUpperCase();
  if (adminRole !== "ADMIN" && adminRole !== "SUPER_ADMIN") {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  // Ensure an internal "actor" exists for required foreign keys in existing schema.
  // This is not Clerk-backed; it's an internal DB identity for auditability.
  const authUserId = `admin:${adminUser.email}`;
  const actorUpsertId = crypto.randomUUID();
  const actorRes = await db.execute(sql`
    insert into "User" ("id", "authUserId", "role")
    values (${actorUpsertId}, ${authUserId}, ${"ADMIN"})
    on conflict ("authUserId") do update set "role" = ${"ADMIN"}
    returning "id"
  `);
  const actor = (actorRes.rows[0] ?? null) as { id: string } | null;
  if (!actor) throw Object.assign(new Error("Actor missing"), { status: 500 });

  return {
    adminUser: { id: adminUser.id, email: adminUser.email, role: adminUser.role },
    actorUser: { id: actor.id }
  };
}

