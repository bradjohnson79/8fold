import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "../../db/schema/user";
import { routers } from "../../db/schema/router";
import { incCounter } from "../server/observability/metrics";
import { logEvent } from "../server/observability/log";
import { requireAuth } from "./requireAuth";

function routePath(req: Request): string | undefined {
  try {
    return new URL(req.url).pathname;
  } catch {
    return undefined;
  }
}

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date(v as any);
}

export type ApiAuthedUser = {
  userId: string; // internal domain User.id
  role: "ADMIN" | "CONTRACTOR" | "ROUTER" | "JOB_POSTER";
};

export async function optionalUser(req: Request): Promise<ApiAuthedUser | null> {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return null;
  const user = authed.internalUser;
  if (!user) return null;

  const status = String(user.status ?? "ACTIVE");
  if (status === "ARCHIVED") return null;
  if (status === "SUSPENDED") return null;
  const role = String(user.role ?? "").trim().toUpperCase();
  if (role !== "JOB_POSTER" && role !== "ROUTER" && role !== "CONTRACTOR" && role !== "ADMIN") {
    // Canonical roles only. Legacy values must be migrated via backfill.
    incCounter("auth_invalid_role_total", { role, route: routePath(req) });
    logEvent({
      level: "warn",
      event: "auth.invalid_role",
      route: routePath(req),
      method: req.method,
      status: 401,
      code: "INVALID_ROLE",
      context: { role, userId: user.id },
    });
    return null;
  }
  return { userId: user.id, role: role as any };
}

export async function requireUser(req: Request): Promise<ApiAuthedUser> {
  const u = await optionalUser(req);
  if (!u) {
    throw Object.assign(new Error("Unauthorized"), {
      status: 401,
      code: "UNAUTHORIZED",
    });
  }
  return u;
}

export async function requireAdmin(req: Request): Promise<ApiAuthedUser> {
  const user = await requireUser(req);
  if (String(user.role) !== "ADMIN") {
    throw Object.assign(new Error("Forbidden"), { status: 403, code: "ROLE_MISMATCH", context: { expectedRole: "ADMIN", role: user.role } });
  }
  return user;
}

/** Admin or Router only. Assignment chain: Router → selects contractor → POST /assign. AI cannot assign. */
export async function requireAdminOrRouter(req: Request): Promise<ApiAuthedUser> {
  const user = await requireUser(req);
  const role = String(user.role);
  if (role === "ROUTER") return await requireRouter(req);
  incCounter("api_403_total", { code: "ROLE_MISMATCH", role, route: routePath(req) });
  logEvent({
    level: "warn",
    event: "rbac.forbidden",
    route: routePath(req),
    method: req.method,
    status: 403,
    userId: user.userId,
    role,
    code: "ROLE_MISMATCH",
    context: { expectedRoles: ["ADMIN", "ROUTER"] },
  });
  throw Object.assign(new Error("Forbidden"), {
    status: 403,
    code: "ROLE_MISMATCH",
    context: { expectedRoles: ["ADMIN", "ROUTER"], role },
  });
}

export async function requireRouter(req: Request): Promise<ApiAuthedUser> {
  const user = await requireUser(req);
  const role = String(user.role);

  if (role !== "ROUTER") {
    incCounter("api_403_total", { code: "ROLE_MISMATCH", role, route: routePath(req) });
    logEvent({
      level: "warn",
      event: "rbac.forbidden",
      route: routePath(req),
      method: req.method,
      status: 403,
      userId: user.userId,
      role,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "ROUTER" },
    });
    throw Object.assign(new Error("Forbidden"), {
      status: 403,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "ROUTER", role },
    });
  }

  return user;
}

export async function requireSeniorRouter(req: Request): Promise<ApiAuthedUser> {
  const user = await requireRouter(req);
  const routerRows = await db
    .select({ isSeniorRouter: routers.isSeniorRouter, status: routers.status })
    .from(routers)
    .where(eq(routers.userId, user.userId))
    .limit(1);
  const router = routerRows[0] ?? null;
  if (!router || router.status !== "ACTIVE" || !router.isSeniorRouter) {
    throw Object.assign(new Error("Forbidden"), {
      status: 403,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "SENIOR_ROUTER" },
    });
  }
  return user;
}

export async function requireJobPoster(req: Request): Promise<ApiAuthedUser> {
  const user = await requireUser(req);
  const role = String(user.role);
  if (role !== "JOB_POSTER") {
    incCounter("api_403_total", { code: "ROLE_MISMATCH", role, route: routePath(req) });
    logEvent({
      level: "warn",
      event: "rbac.forbidden",
      route: routePath(req),
      method: req.method,
      status: 403,
      userId: user.userId,
      role,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "JOB_POSTER" },
    });
    throw Object.assign(new Error("Forbidden"), {
      status: 403,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "JOB_POSTER", role },
    });
  }
  return user;
}

export async function requireContractor(req: Request): Promise<ApiAuthedUser> {
  const user = await requireUser(req);
  const role = String(user.role);
  if (role !== "CONTRACTOR") {
    incCounter("api_403_total", { code: "ROLE_MISMATCH", role, route: routePath(req) });
    logEvent({
      level: "warn",
      event: "rbac.forbidden",
      route: routePath(req),
      method: req.method,
      status: 403,
      userId: user.userId,
      role,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "CONTRACTOR" },
    });
    throw Object.assign(new Error("Forbidden"), {
      status: 403,
      code: "ROLE_MISMATCH",
      context: { expectedRole: "CONTRACTOR", role },
    });
  }
  return user;
}

export async function requireSupportRequester(req: Request): Promise<ApiAuthedUser> {
  const user = await requireUser(req);
  const r = String(user.role);
  if (r === "ADMIN") {
    throw Object.assign(new Error("Forbidden"), { status: 403, code: "ROLE_MISMATCH", context: { disallowedRole: "ADMIN", role: r } });
  }
  if (r !== "JOB_POSTER" && r !== "ROUTER" && r !== "CONTRACTOR") {
    throw Object.assign(new Error("Forbidden"), { status: 403, code: "ROLE_MISMATCH", context: { role: r } });
  }
  return user;
}
