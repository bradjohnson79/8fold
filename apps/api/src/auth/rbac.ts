import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "../../db/schema/adminUser";
import { routers } from "../../db/schema/router";
import { routerProfiles } from "../../db/schema/routerProfile";
import { users } from "../../db/schema/user";
import { verifyInternalAdmin } from "../server/requireInternalAdmin";
import { incCounter } from "../server/observability/metrics";
import { logEvent } from "../server/observability/log";

function routePath(req: Request): string | undefined {
  try {
    return new URL(req.url).pathname;
  } catch {
    return undefined;
  }
}

function getAuthDbSchema(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

const AUTH_SCHEMA = getAuthDbSchema() ?? "public";
const SESSION_T = sql.raw(`"${AUTH_SCHEMA}"."Session"`);

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date(v as any);
}

export type ApiAuthedUser = {
  userId: string; // app User.id OR AdminUser.id (admin routes only)
  role: "ADMIN" | "CONTRACTOR" | "ROUTER" | "JOB_POSTER";
};

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=") ?? "";
  }
  return out;
}

function getSessionTokenFromRequest(req: Request): string | null {
  const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  const header = req.headers.get("x-session-token");
  if (header && header.trim().length > 0) return header.trim();

  // Dev/local convenience: allow cookie-based auth for browser calls directly to apps/api.
  // This keeps the canonical token the same ("sid"), but does not require client JS to
  // manually attach Authorization headers.
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  const sidRaw = cookies["sid"] ?? "";
  if (!sidRaw) return null;
  try {
    const sid = decodeURIComponent(sidRaw);
    return sid && sid.trim().length > 0 ? sid.trim() : null;
  } catch {
    return null;
  }
}

async function optionalInternalAdmin(req: Request): Promise<ApiAuthedUser | null> {
  const verified = await verifyInternalAdmin(req);
  if (!verified) return null;
  return { userId: verified.adminId, role: "ADMIN" };
}

export async function optionalUser(req: Request): Promise<ApiAuthedUser | null> {
  const raw = getSessionTokenFromRequest(req);
  if (!raw) return null;

  const tokenHash = sha256(raw);
  const sessionRes = await db.execute(sql`
    select "userId", "expiresAt", "revokedAt"
    from ${SESSION_T}
    where "sessionTokenHash" = ${tokenHash}
    limit 1
  `);
  const sessionRow = (sessionRes.rows[0] ?? null) as
    | { userId: string; expiresAt: unknown; revokedAt: unknown | null }
    | null;
  const session = sessionRow
    ? { userId: sessionRow.userId, expiresAt: asDate(sessionRow.expiresAt), revokedAt: sessionRow.revokedAt ? asDate(sessionRow.revokedAt) : null }
    : null;
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const userRows = await db
    .select({
      id: users.id,
      role: users.role,
      authUserId: users.authUserId,
      status: users.status,
      suspendedUntil: users.suspendedUntil,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = userRows[0] ?? null;
  if (!user) return null;

  const status = String(user.status ?? "ACTIVE");
  const suspendedUntil = user.suspendedUntil ? (user.suspendedUntil instanceof Date ? user.suspendedUntil : new Date(user.suspendedUntil)) : null;
  if (status === "ARCHIVED") return null;
  if (status === "SUSPENDED" && suspendedUntil && suspendedUntil.getTime() > Date.now()) return null;
  if (status === "SUSPENDED" && (!suspendedUntil || suspendedUntil.getTime() <= Date.now())) {
    await db.update(users).set({ status: "ACTIVE", suspendedUntil: null, suspensionReason: null, updatedAt: new Date() }).where(eq(users.id, user.id));
  }
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
  const admin = await optionalInternalAdmin(req);
  if (!admin) {
    throw Object.assign(new Error("Unauthorized"), {
      status: 401,
      code: "UNAUTHORIZED",
    });
  }
  return admin;
}

/** Admin or Router only. Assignment chain: Router → selects contractor → POST /assign. AI cannot assign. */
export async function requireAdminOrRouter(req: Request): Promise<ApiAuthedUser> {
  const admin = await optionalInternalAdmin(req);
  if (admin) return admin;

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

  // Unified routers table (first-class). No runtime auto-creation:
  // The one-time backfill script must provision missing rows.
  const routerRows = await db
    .select({ status: routers.status })
    .from(routers)
    .where(eq(routers.userId, user.userId))
    .limit(1);
  const router = routerRows[0] ?? null;

  // Defensive visibility for role ↔ provisioning drift (no behavior change).
  if (router && role !== "ROUTER") {
    logEvent({
      level: "warn",
      event: "rbac.role_provisioning_drift",
      route: routePath(req),
      method: req.method,
      status: 200,
      userId: user.userId,
      role,
      code: "ROLE_PROVISIONING_DRIFT",
      context: { routersStatus: (router as any).status },
    });
  }

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

  const profileRows = await db
    .select({ status: routerProfiles.status })
    .from(routerProfiles)
    .where(eq(routerProfiles.userId, user.userId))
    .limit(1);
  const profile = profileRows[0] ?? null;
  if (!profile || profile.status !== "ACTIVE") {
    incCounter("api_403_total", { code: "ROUTER_NOT_ACTIVE", role, route: routePath(req) });
    logEvent({
      level: "warn",
      event: "rbac.router_not_active",
      route: routePath(req),
      method: req.method,
      status: 403,
      userId: user.userId,
      role,
      code: "ROUTER_NOT_ACTIVE",
    });
    throw Object.assign(new Error("Router not active"), {
      status: 403,
      code: "ROUTER_NOT_ACTIVE",
    });
  }
  if (!router || router.status !== "ACTIVE") {
    incCounter("api_403_total", { code: "ROUTER_NOT_PROVISIONED", role, route: routePath(req) });
    logEvent({
      level: "warn",
      event: "rbac.router_not_provisioned",
      route: routePath(req),
      method: req.method,
      status: 403,
      userId: user.userId,
      role,
      code: "ROUTER_NOT_PROVISIONED",
    });
    throw Object.assign(new Error("Router not provisioned"), {
      status: 403,
      code: "ROUTER_NOT_PROVISIONED",
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
