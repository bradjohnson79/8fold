import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLoginCode } from "../../../../src/auth/mobileAuth";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "../../../../db/schema/user";
import { jobs } from "../../../../db/schema/job";
import { routers } from "../../../../db/schema/router";
import crypto from "node:crypto";
import { authRateLimitConfig, rateLimitJson } from "@/src/server/rateLimit";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z
  .object({
    // Support both shapes (some clients send `code`, existing sends `token`)
    code: z.string().trim().min(4).optional(),
    token: z.string().trim().min(4).optional(),
    // Role selection at signup (web).
    role: z.enum(["router", "job-poster", "contractor"]).optional(),
    // Optional; only validated/logged if present.
    email: z.string().trim().email().optional(),
  })
  .refine((v) => Boolean(v.code || v.token), {
    message: "Missing required fields",
  });

function errJson(
  message: string,
  status: number,
  code: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error: message, code, ...extra }, { status });
}

function cookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  // Minimal cookie parser: exact name match.
  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    const idx = s.indexOf("=");
    if (idx <= 0) continue;
    const k = s.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(s.slice(idx + 1).trim());
  }
  return null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  try {
    const rl = authRateLimitConfig();
    const limited = rateLimitJson(req, { key: "auth:verify", ...rl.verify });
    if (limited) return limited;

    const raw = await req.text().catch(() => "");
    let parsed: unknown = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      return errJson("Invalid JSON body", 400, "INVALID_JSON", { requestId });
    }

    const safeBody = (() => {
      if (!parsed || typeof parsed !== "object") return parsed;
      const p: any = parsed as any;
      const out: any = { ...p };
      if (typeof out.token === "string") out.token = `[redacted:${out.token.length}]`;
      if (typeof out.code === "string") out.code = `[redacted:${out.code.length}]`;
      return out;
    })();
    const body = BodySchema.safeParse(parsed);
    if (!body.success) {
      return errJson("Missing required fields", 400, "INVALID_INPUT", {
        details: body.error.flatten(),
        requestId,
      });
    }

    // Prevent undefined env usage / hard-to-debug null DB failures.
    const databaseUrl = process.env.DATABASE_URL ?? "";
    if (!databaseUrl) {
      logEvent({
        level: "error",
        event: "auth.verify_config_missing",
        route: "/api/auth/verify",
        method: "POST",
        status: 503,
        code: "CONFIG_MISSING",
        context: { missing: ["DATABASE_URL"], requestId },
      });
      return errJson("Server misconfigured", 503, "CONFIG_MISSING", {
        missing: ["DATABASE_URL"],
        requestId,
      });
    }

    const token = (body.data.code ?? body.data.token ?? "").trim();
    if (!token) return errJson("Missing required fields", 400, "INVALID_INPUT", { requestId });

    let result: Awaited<ReturnType<typeof verifyLoginCode>>;
    try {
      result = await verifyLoginCode(token);
    } catch (e) {
      // Expected auth failures (invalid/expired/used token) should return 4xx, not 500.
      const status = typeof (e as any)?.status === "number" ? (e as any).status : 500;
      const message = e instanceof Error ? e.message : "Verification failed";
      const code = typeof (e as any)?.code === "string" ? String((e as any).code) : "AUTH_FAILED";
      if (status >= 400 && status < 500) return errJson(message, status, code, { requestId });
      logEvent({
        level: "error",
        event: "auth.verify_db_error",
        route: "/api/auth/verify",
        method: "POST",
        status: 500,
        code: "INTERNAL_ERROR",
        context: { requestId },
      });
      return errJson("Server error", 500, "INTERNAL_ERROR", { requestId });
    }

    const userId = result?.user?.id ?? null;
    if (!userId) {
      logEvent({
        level: "warn",
        event: "auth.verify_postprocess_skipped",
        route: "/api/auth/verify",
        method: "POST",
        status: 200,
        code: "POSTPROCESS_SKIPPED",
        context: { requestId },
      });
    } else {
      // Apply role selection (if present) and attach referral attribution (if present).
      const desiredRole =
        body.data.role === "router"
          ? "ROUTER"
          : body.data.role === "contractor"
            ? "CONTRACTOR"
            : body.data.role === "job-poster"
              ? "JOB_POSTER"
              : null;

      const cookieHeader = String(req.headers.get("cookie") ?? "");
      const refRaw =
        String(req.headers.get("router_ref") ?? req.headers.get("x-router-ref") ?? "").trim() ||
        String(cookieValue(cookieHeader, "router_ref") ?? "").trim();
      const routerRef = refRaw && isUuid(refRaw) ? refRaw : "";

      if (desiredRole) {
        // Lifetime role immutability: never mutate user.role here.
        const r = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
        const currentRole = String(r[0]?.role ?? "").toUpperCase();
        if (currentRole && currentRole !== desiredRole) {
          return errJson("Role selection is permanent and cannot be changed.", 409, "ROLE_IMMUTABLE", { requestId });
        }
      }

      await db.transaction(async (tx) => {
        if (!routerRef) return;
        if (routerRef === userId) return;

        const uRows = await tx
          .select({ id: users.id, role: users.role, referredByRouterId: users.referredByRouterId })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const u = uRows[0] ?? null;
        if (!u) return;
        if (u.referredByRouterId) return;

        const roleNow = String(u.role ?? "").toUpperCase();
        if (roleNow === "ROUTER" || roleNow === "ADMIN") return; // routers/admins cannot be referred

        // Attach referral only if this user has not participated in any jobs yet (signup-only).
        const existingJob = await tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(or(eq(jobs.job_poster_user_id, userId), eq(jobs.contractor_user_id, userId)))
          .limit(1);
        if (existingJob[0]?.id) return;

        const routerUser = await tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, routerRef))
          .limit(1);
        const rUser = routerUser[0] ?? null;
        if (!rUser || String(rUser.role ?? "").toUpperCase() !== "ROUTER") return;

        const routerRows = await tx
          .select({ userId: routers.userId, status: routers.status })
          .from(routers)
          .where(and(eq(routers.userId, routerRef), eq(routers.status, "ACTIVE" as any)))
          .limit(1);
        if (!routerRows[0]?.userId) return;

        await tx.update(users).set({ referredByRouterId: routerRef }).where(eq(users.id, userId));

        logEvent({
          level: "info",
          event: "auth.referral_attached",
          route: "/api/auth/verify",
          method: "POST",
          status: 200,
          code: "REFERRAL_ATTACHED",
          context: { requestId, routerUserId: routerRef, referredUserId: userId },
        });
      });
    }

    const res = NextResponse.json({ ...result, requestId });

    // Cross-port localhost session cookie (dev) + production-safe settings.
    // Cookies are scoped by host, not port, so `localhost` works for 3003 ↔ 3006.
    const secure = process.env.NODE_ENV === "production";
    const expires = new Date(result.expiresAt);
    // Do not set `domain` in dev; host-only cookie is correct for localhost.
    res.cookies.set("sid", result.sessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure,
      expires,
    });

    return res;
  } catch (err) {
    // Normalize known error shapes (we throw errors with `.status` elsewhere)
    const status =
      typeof (err as any)?.status === "number"
        ? (err as any).status
        : typeof (err as any)?.cause?.status === "number"
          ? (err as any).cause.status
          : 500;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Internal server error";

    logEvent({
      level: "error",
      event: "auth.verify_error",
      route: "/api/auth/verify",
      method: "POST",
      status,
      durationMs: Date.now() - start,
      code: typeof (err as any)?.code === "string" ? String((err as any).code) : status >= 400 && status < 500 ? "AUTH_FAILED" : "INTERNAL_ERROR",
    });

    // Prefer 4xx for expected auth failures (invalid/expired/used token, etc.)
    if (status >= 400 && status < 500) {
      const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "AUTH_FAILED";
      return errJson(message, status, code, { requestId });
    }

    return errJson("Server error", 500, "INTERNAL_ERROR", { requestId });
  }
}

