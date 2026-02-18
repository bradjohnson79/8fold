import { NextResponse } from "next/server";
import { requireAuth } from "../../../src/auth/requireAuth";
import { getOrCreateRequestId, withRequestIdHeader } from "../../../src/auth/errors/authErrorResponse";
import { getWalletTotals } from "../../../src/wallet/totals";

export async function GET(req: Request) {
  try {
    const requestId = getOrCreateRequestId(req);
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    // /api/me is a session bootstrap endpoint. It should not hard-fail with 403 just because
    // role assignment / provisioning is still in progress. Return a 200 envelope so the client
    // can route the user to onboarding deterministically.
    if (!authed.internalUser || !String(authed.internalUser.role ?? "").trim()) {
      const resp = NextResponse.json({
        ok: true,
        data: {
          id: authed.internalUser?.id ?? null,
          role: authed.internalUser?.role ?? null,
          email: authed.internalUser?.email ?? null,
          walletBalanceCents: 0,
          roleAssigned: false,
        },
        requestId,
      });
      return withRequestIdHeader(resp, requestId);
    }

    const walletTotals = await getWalletTotals(authed.internalUser.id).catch(() => null);
    const walletBalance = walletTotals ? walletTotals.AVAILABLE : 0;

    const role = String(authed.internalUser.role ?? "").trim().toUpperCase();

    const resp = NextResponse.json({
      ok: true,
      data: {
        id: authed.internalUser.id,
        role: authed.internalUser.role,
        email: authed.internalUser.email,
        walletBalanceCents: walletBalance,
      },
      requestId,
    });
    return withRequestIdHeader(resp, requestId);
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, error: err?.message || "Unauthorized" }, { status });
  }
}

