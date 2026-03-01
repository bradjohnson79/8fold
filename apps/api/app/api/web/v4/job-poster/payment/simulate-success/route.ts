import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { simulateJobPosterPaymentSuccess } from "@/src/services/v4/jobPosterPaymentService";
import { stripe } from "@/src/payments/stripe";
import { forbidden, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

function isStripeSimulationEnabled(): boolean {
  const explicit = String(process.env.STRIPE_SIMULATION_ENABLED ?? "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return true;
}

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    if (!isStripeSimulationEnabled()) {
      const wrapped = forbidden("V4_STRIPE_SIM_DISABLED", "Stripe simulation mode is disabled.");
      return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
    }

    if (!stripe) {
      return NextResponse.json({ ok: false, error: "STRIPE_NOT_CONFIGURED" });
    }

    await simulateJobPosterPaymentSuccess(role.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SIMULATE_PAYMENT_SUCCESS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
