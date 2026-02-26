import { requireRole, type RequireRoleOk } from "./requireRole";
import { isContractorSuspended } from "./checkContractorSuspension";

/**
 * Centralized contractor auth for V4 routes.
 * Wraps requireAuth + requireRole("CONTRACTOR").
 * Enforces suspension: blocks invite acceptance, availability, PM creation, messaging, receipts.
 */
export async function requireContractorV4(req: Request): Promise<RequireRoleOk | Response> {
  const role = await requireRole(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  if (await isContractorSuspended(role.internalUser.id)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "V4_CONTRACTOR_SUSPENDED",
        message: "Your account is suspended. Contact support.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return role;
}
