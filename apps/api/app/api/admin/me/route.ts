import { NextResponse } from "next/server";
import { requireAdminIdentityWithTier, tierLabel } from "../_lib/adminTier";

export async function GET(req: Request) {
  try {
    const identity = await requireAdminIdentityWithTier(req);
    if (identity instanceof Response) return identity;

    return NextResponse.json(
      {
        ok: true,
        data: {
          admin: {
            id: identity.userId,
            email: identity.email,
            role: identity.adminRole,
          },
          adminTier: identity.tier,
          adminTierLabel: tierLabel(identity.tier),
          capabilities: {
            canMutate: identity.tier !== "ADMIN_VIEWER",
            canFinancialOverride: identity.tier === "ADMIN_SUPER",
          },
        },
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("[ADMIN_ME_ERROR]", { message: (err as Error)?.message, stack: (err as Error)?.stack?.slice(0, 500) });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      },
      { status: 401 },
    );
  }
}
