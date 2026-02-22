import { NextResponse } from "next/server";
import { getAdminIdentityBySessionToken, adminSessionTokenFromRequest } from "@/src/lib/auth/adminSession";
import { tierFromEmail, tierLabel } from "../_lib/adminTier";

export async function GET(req: Request) {
  try {
    const token = adminSessionTokenFromRequest(req);
    if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const admin = await getAdminIdentityBySessionToken(token);
    if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const tier = tierFromEmail(admin.email);
    return NextResponse.json(
      {
        ok: true,
        data: {
          admin,
          adminTier: tier,
          adminTierLabel: tierLabel(tier),
          capabilities: {
            canMutate: tier !== "ADMIN_VIEWER",
            canFinancialOverride: tier === "ADMIN_SUPER",
          },
        },
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("[ADMIN_ME_ERROR]", { message: (err as Error)?.message, stack: (err as Error)?.stack?.slice(0, 500) });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
}

