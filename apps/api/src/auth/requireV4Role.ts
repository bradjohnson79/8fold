import { AuthErrorCodes } from "./errors/authErrorCodes";
import { authErrorResponse, logAuthFailure } from "./errors/authErrorResponse";
import { requireAuth } from "./requireAuth";

export type RequireV4RoleOk = {
  userId: string;
  role: string;
  clerkUserId: string;
  requestId: string;
};

/**
 * V4 role guard: validates Clerk session, fetches DB user, validates role.
 * - 401 if not authenticated
 * - 403 if wrong role (never trust session-only claims; always use DB)
 * - Never redirects inside API
 */
export async function requireV4Role(
  req: Request,
  requiredRole: "JOB_POSTER" | "CONTRACTOR" | "ROUTER",
): Promise<RequireV4RoleOk | Response> {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;

  const user = authed.internalUser;
  if (!user) {
    logAuthFailure(req, {
      level: "warn",
      event: "auth.user_not_found",
      code: AuthErrorCodes.USER_ROLE_NOT_ASSIGNED,
      requestId: authed.requestId,
      clerkUserId: authed.clerkUserId,
      requiredRole,
    });
    return authErrorResponse(req, {
      status: 403,
      code: AuthErrorCodes.USER_ROLE_NOT_ASSIGNED,
      requestId: authed.requestId,
    });
  }

  const role = String(user.role ?? "").toUpperCase();
  if (!role || role !== requiredRole) {
    logAuthFailure(req, {
      level: "warn",
      event: "auth.role_mismatch",
      code: AuthErrorCodes.ROLE_MISMATCH,
      requestId: authed.requestId,
      clerkUserId: authed.clerkUserId,
      internalUserId: user.id,
      role,
      requiredRole,
    });
    return authErrorResponse(req, {
      status: 403,
      code: AuthErrorCodes.ROLE_MISMATCH,
      requestId: authed.requestId,
      details: { requiredRole, actualRole: role },
    });
  }

  const status = String(user.status ?? "ACTIVE").toUpperCase();
  if (status === "ARCHIVED" || status === "SUSPENDED") {
    return authErrorResponse(req, {
      status: 403,
      code: AuthErrorCodes.USER_SOFT_DELETED,
      requestId: authed.requestId,
      details: { status },
    });
  }

  return {
    userId: user.id,
    role,
    clerkUserId: authed.clerkUserId,
    requestId: authed.requestId,
  };
}
