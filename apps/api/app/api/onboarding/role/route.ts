import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema/user";
import { AuthErrorCodes } from "@/src/auth/errors/authErrorCodes";
import { authErrorResponse, getOrCreateRequestId, withRequestIdHeader } from "@/src/auth/errors/authErrorResponse";
import { requireAuth } from "@/src/auth/requireAuth";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";

const BodySchema = z.object({
  role: z.enum(["JOB_POSTER", "CONTRACTOR", "ROUTER"]),
});

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req);
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;

  // Role assignment can only happen once; role authority is internal DB, not Clerk metadata.
  if (authed.internalUser) {
    return authErrorResponse(req, {
      status: 409,
      code: AuthErrorCodes.ROLE_IMMUTABLE,
      requestId,
      message: "Role selection is permanent and cannot be changed.",
    });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return authErrorResponse(req, {
      status: 400,
      code: AuthErrorCodes.AUTH_INVALID_TOKEN,
      requestId,
      message: "Invalid JSON body",
    });
  }

  const body = BodySchema.safeParse(parsed);
  if (!body.success) {
    return authErrorResponse(req, {
      status: 400,
      code: AuthErrorCodes.ROLE_NOT_PERMITTED,
      requestId,
      details: { issues: body.error.flatten() },
      message: "Invalid role selection",
    });
  }

  // Defensive: re-check in case of race (concurrent request already inserted).
  const existing = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkUserId, authed.clerkUserId))
    .limit(1);
  if (existing.length > 0) {
    const resp = NextResponse.json(
      { ok: true, data: { role: existing[0]!.role ?? body.data.role }, requestId },
      { status: 201 },
    );
    return withRequestIdHeader(resp, requestId);
  }

  try {
    await db.insert(users).values({
      clerkUserId: authed.clerkUserId,
      role: body.data.role as any,
      status: "ACTIVE" as any,
    } as any);
  } catch (err: unknown) {
    const pg = err as { code?: string; message?: string };
    // eslint-disable-next-line no-console
    console.error("ONBOARDING_INSERT_ERROR::", {
      code: pg.code ?? null,
      message: pg.message ?? (err instanceof Error ? err.message : String(err)),
      clerkUserId: authed.clerkUserId,
      role: body.data.role,
      requestId,
    });
    // Duplicate key (race): treat as success.
    if (pg.code === "23505") {
      const resp = NextResponse.json({ ok: true, data: { role: body.data.role }, requestId }, { status: 201 });
      return withRequestIdHeader(resp, requestId);
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: pg.message ?? "Database error during onboarding",
          code: pg.code ?? null,
        },
        requestId,
      },
      { status: 500 },
    );
  }

  // Fetch the newly created row to get the internal UUID and any pre-populated fields.
  // Emit a signup domain event so admins receive an in-app + email notification.
  void (async () => {
    try {
      const newUser = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.clerkUserId, authed.clerkUserId))
        .limit(1);

      const userId = newUser[0]?.id ?? authed.clerkUserId;
      // Name/email: prefer DB row (may be populated by Clerk sync webhook),
      // fall back to Clerk JWT claims, then sensible defaults.
      const claims = authed.safeClaims ?? {};
      const claimsName = String(
        claims.name ?? claims.full_name ?? [claims.first_name, claims.last_name].filter(Boolean).join(" ") ?? "",
      ).trim();
      const name = newUser[0]?.name ?? (claimsName || "Unknown");

      const claimsEmail = String(claims.email ?? claims.email_address ?? "").trim();
      const email = newUser[0]?.email ?? claimsEmail;

      const createdAt = new Date().toISOString();
      const dedupeKey = `signup_${body.data.role}_${authed.clerkUserId}`;

      const roleEventMap = {
        JOB_POSTER: "JOB_POSTER_REGISTERED",
        CONTRACTOR: "CONTRACTOR_REGISTERED",
        ROUTER: "ROUTER_REGISTERED",
      } as const;

      await emitDomainEvent(
        {
          type: roleEventMap[body.data.role],
          payload: { userId, name, email, createdAt, dedupeKey },
        },
        { mode: "best_effort" },
      );
    } catch (err) {
      console.error("[ONBOARDING_SIGNUP_EVENT_ERROR]", {
        clerkUserId: authed.clerkUserId,
        role: body.data.role,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  const resp = NextResponse.json({ ok: true, data: { role: body.data.role }, requestId }, { status: 201 });
  return withRequestIdHeader(resp, requestId);
}

