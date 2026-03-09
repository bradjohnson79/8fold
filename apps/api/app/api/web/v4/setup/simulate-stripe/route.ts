import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { simulateJobPosterPaymentSuccess } from "@/src/services/v4/jobPosterPaymentService";
import { stripe } from "@/src/payments/stripe";
import {
  isStripeSimulationEnabled,
  markSimulatedApproval,
  getExistingStripeAccountId,
  getUserCountryForSim,
  expectedCurrencyForCountry,
  type SimRole,
} from "@/src/services/v4/stripeSimulationService";

export async function POST(req: Request) {
  try {
    if (!isStripeSimulationEnabled()) {
      return NextResponse.json({ ok: false, error: "Stripe simulation is disabled." }, { status: 403 });
    }

    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    const userId = authed.internalUser?.id;
    const role = String(authed.internalUser?.role ?? "").toUpperCase();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (role === "JOB_POSTER") {
      if (!stripe) {
        return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 500 });
      }
      await simulateJobPosterPaymentSuccess(userId);
      return NextResponse.json({ ok: true, role: "JOB_POSTER" });
    }

    if (role === "ROUTER" || role === "CONTRACTOR") {
      const simRole = role as SimRole;
      const country = await getUserCountryForSim(userId, simRole);
      const expectedCurrency = expectedCurrencyForCountry(country);
      const existing = await getExistingStripeAccountId(userId);
      const safeUserId = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "user";
      const simulatedAccountId = existing || `sim_${simRole.toLowerCase()}_${safeUserId}`;

      await markSimulatedApproval({
        userId,
        role: simRole,
        stripeAccountId: simulatedAccountId,
        expectedCurrency,
      });

      return NextResponse.json({ ok: true, role: simRole, stripeAccountId: simulatedAccountId });
    }

    return NextResponse.json({ ok: false, error: "Role not eligible for Stripe simulation." }, { status: 403 });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to simulate Stripe approval." },
      { status },
    );
  }
}
