import bcrypt from "bcrypt";
import { isNull, isNotNull, desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { admins } from "@/db/schema/admin";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

function isSuperAdmin(role: string) {
  return String(role).toUpperCase() === "SUPER_ADMIN";
}

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const rows = await db
      .select({
        id: admins.id,
        email: admins.email,
        role: admins.role,
        createdAt: admins.createdAt,
        disabledAt: admins.disabledAt,
      })
      .from(admins)
      .orderBy(desc(admins.createdAt));

    const users = rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role ?? "STANDARD",
      status: r.disabledAt ? "SUSPENDED" : "ACTIVE",
      createdAt: r.createdAt?.toISOString() ?? null,
      disabledAt: r.disabledAt?.toISOString() ?? null,
    }));

    return ok({ users, totalCount: users.length });
  } catch (e) {
    console.error("[ADMIN_USERS_LIST_ERROR]", { err: String(e) });
    return err(500, "ADMIN_USERS_LIST_FAILED", "Failed to list admin users");
  }
}

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  if (!isSuperAdmin(authed.role)) {
    return err(403, "FORBIDDEN", "Only SUPER_ADMIN can create admin users");
  }

  let body: { email?: string; role?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return err(400, "INVALID_JSON", "Invalid request body");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "ADMIN").trim().toUpperCase();
  const password = String(body.password ?? "").trim();

  if (!email || !email.includes("@")) {
    return err(400, "INVALID_EMAIL", "A valid email is required");
  }
  if (!["SUPER_ADMIN", "ADMIN", "OPERATOR", "STANDARD"].includes(role)) {
    return err(400, "INVALID_ROLE", "Role must be one of: SUPER_ADMIN, ADMIN, OPERATOR");
  }
  if (!password || password.length < 8) {
    return err(400, "INVALID_PASSWORD", "Password must be at least 8 characters");
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const inserted = await db
      .insert(admins)
      .values({
        id: randomUUID(),
        email,
        passwordHash,
        role,
      } as any)
      .returning({ id: admins.id, email: admins.email, role: admins.role });

    return ok({ user: { id: inserted[0].id, email: inserted[0].email, role: inserted[0].role } }, 201);
  } catch (e: any) {
    if (e?.code === "23505" || String(e).includes("unique")) {
      return err(409, "EMAIL_TAKEN", "An admin with that email already exists");
    }
    console.error("[ADMIN_USERS_CREATE_ERROR]", { err: String(e) });
    return err(500, "ADMIN_USERS_CREATE_FAILED", "Failed to create admin user");
  }
}
