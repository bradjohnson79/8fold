import { NextResponse } from "next/server";
import { ilike } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "@/db/schema/adminUser";
import { requireAuth } from "@/src/auth/requireAuth";
import { getClerkIdentity } from "@/src/auth/getClerkIdentity";

const ADMIN_ROLES = new Set(["ADMIN_SUPER", "ADMIN_OPERATOR", "ADMIN_VIEWER", "ADMIN"]);

export type RequireAdminClerkOk = {
  requestId: string;
  clerkUserId: string;
  admin: {
    id: string;
    email: string;
    role: string;
  };
};

function unauthorized(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message,
      },
    },
    { status: 401 },
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message,
      },
    },
    { status: 403 },
  );
}

export async function requireAdminClerk(req: Request): Promise<RequireAdminClerkOk | NextResponse> {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed as NextResponse;

  const identity = await getClerkIdentity(authed.clerkUserId).catch(() => null);
  const email = String(identity?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return unauthorized("Authenticated user has no primary email.");

  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
    })
    .from(adminUsers)
    .where(ilike(adminUsers.email, email))
    .limit(1);
  const admin = rows[0] ?? null;
  if (!admin?.id) return forbidden("Admin access is not provisioned for this account.");

  const role = String(admin.role ?? "")
    .trim()
    .toUpperCase();
  if (!ADMIN_ROLES.has(role)) return forbidden("Admin role is required.");

  return {
    requestId: authed.requestId,
    clerkUserId: authed.clerkUserId,
    admin: {
      id: String(admin.id),
      email: String(admin.email),
      role,
    },
  };
}
