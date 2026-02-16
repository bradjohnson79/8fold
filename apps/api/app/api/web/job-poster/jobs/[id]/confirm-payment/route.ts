import { NextResponse } from "next/server";

/**
 * Deprecated: job funding is finalized by Stripe webhook only.
 *
 * Flow:
 * - Create PaymentIntent: POST `/api/web/jobs/:id/payment-intent`
 * - Confirm payment client-side (Stripe Elements)
 * - Poll: GET `/api/web/jobs/:id/payment-status` until `paymentStatus=FUNDED`
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Deprecated. Funding is finalized by webhook; poll payment status." },
    { status: 410 },
  );
}

