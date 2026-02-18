import { AuthErrorCodes } from "./errors/authErrorCodes";
import { authErrorResponse, logAuthFailure } from "./errors/authErrorResponse";
import { requireAuth, type RequireAuthOk } from "./requireAuth";

export type RequireRoleOk = RequireAuthOk & { internalUser: NonNullable<RequireAuthOk["internalUser"]> };

export async function requireRole(
  req: Request,
  requiredRole: "JOB_POSTER" | "CONTRACTOR" | "ROUTER" | "ADMIN",
): Promise<RequireRoleOk | Response> {
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
  if (!role) {
    return authErrorResponse(req, {
      status: 403,
      code: AuthErrorCodes.USER_ROLE_NOT_ASSIGNED,
      requestId: authed.requestId,
    });
  }
  if (role !== requiredRole) {
    logAuthFailure(req, {
      level: "warn",
      event: "auth.role_mismatch",
      code: requiredRole === "ADMIN" ? AuthErrorCodes.ADMIN_REQUIRED : AuthErrorCodes.ROLE_MISMATCH,
      requestId: authed.requestId,
      clerkUserId: authed.clerkUserId,
      internalUserId: user.id,
      role,
      requiredRole,
    });
    return authErrorResponse(req, {
      status: 403,
      code: requiredRole === "ADMIN" ? AuthErrorCodes.ADMIN_REQUIRED : AuthErrorCodes.ROLE_MISMATCH,
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

  return { ...authed, internalUser: user } as any;
}
